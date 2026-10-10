import OpenAI from "openai";
import sharp from "sharp";
import { GenerateLogoImageBody, GenerateLogoImageResponse } from "@workspace/api-zod";
import { POE_IMAGE_MODELS } from "@workspace/integrations-openai-ai-server/poe";

export const MAX_PNG_BYTES = 8 * 1024 * 1024;
export const MAX_PROVIDER_BYTES = 12 * 1024 * 1024;
export const GENERATION_TIMEOUT_MS = 90_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const POE_API_URL = "https://api.poe.com/v1";
// Bind this fixed logo bot to the project's user-approved Poe allowlist.
// Poe's public API catalog uses lowercase bot identifiers.
const LOGO_MODEL = POE_IMAGE_MODELS["Flux-2-Turbo"].model.toLowerCase();
// Poe hosts generated media separately from its API. Exact CDN hosts only; never follow redirects.
const POE_MEDIA_HOSTS = new Set(["pfst.cf2.poecdn.net", "psc2.cf2.poecdn.net", "qph.cf2.poecdn.net"]);

const inspirations = {
  cloudline: "Cloudline: A quiet sky shape traced in one continuous pencil line.",
  viewfinder: "Field of view: A photo frame and a small point of focus, held in balance.",
  gesture: "Brush in motion: A loose, confident stroke turns a cloud into a painter’s mark.",
  paperfold: "Folded study: A sheet of sketch paper, with a corner lifted toward the light.",
  sunstudy: "Weather note: A tiny sun meets an observing cloud: a mark for looking closer.",
};

export type ErrorCode = "INVALID_INPUT" | "BODY_TOO_LARGE" | "REFUSED" | "RATE_LIMITED" | "BUSY" |
  "UNAVAILABLE" | "PROVIDER_FAILED" | "INVALID_IMAGE" | "TIMEOUT";
const errors: Record<ErrorCode, { status: number; message: string; retryable: boolean }> = {
  INVALID_INPUT: { status: 400, message: "Enter a logo prompt between 1 and 1,200 characters and choose a listed direction.", retryable: false },
  BODY_TOO_LARGE: { status: 413, message: "This request is too large. Shorten your logo prompt and try again.", retryable: false },
  REFUSED: { status: 422, message: "The AI service could not accept this concept. Change your prompt and try again.", retryable: false },
  RATE_LIMITED: { status: 429, message: "Too many generation requests. Wait a few minutes before trying again.", retryable: true },
  BUSY: { status: 503, message: "The image generator is busy. Please try again shortly.", retryable: true },
  UNAVAILABLE: { status: 503, message: "Poe image generation is unavailable. Check that a Poe API key is configured and the account has points. The five logo directions and sketch workspace still work.", retryable: true },
  PROVIDER_FAILED: { status: 502, message: "The AI service could not complete the image. Please try again.", retryable: true },
  INVALID_IMAGE: { status: 502, message: "The AI service returned an unreadable image. Please try again.", retryable: true },
  TIMEOUT: { status: 504, message: "Image generation took too long. Please try again.", retryable: true },
};

export class LogoImageError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  constructor(code: ErrorCode) {
    super(errors[code].message);
    this.code = code;
    this.status = errors[code].status;
    this.retryable = errors[code].retryable;
  }
  toJSON() { return { code: this.code, message: this.message, retryable: this.retryable }; }
}

export function parseLogoInput(body: unknown) {
  // Orval's object schema is deliberately made strict at the server boundary.
  const parsed = GenerateLogoImageBody.strict().safeParse(body);
  if (!parsed.success || !parsed.data.prompt.trim()) throw new LogoImageError("INVALID_INPUT");
  return { ...parsed.data, prompt: parsed.data.prompt.trim() };
}

export function composeLogoPrompt(input: ReturnType<typeof parseLogoInput>) {
  return [
    "Create exactly one square, 1024 by 1024 exploratory logo image for CloudPainter, a calm creative sketching app.",
    "Use a simple legible mark, a restrained palette, and a plain background. Low-detail raster concept, not a final vector identity. No lettering unless specifically requested.",
    input.direction ? `Text-only inspiration: ${inspirations[input.direction]}` : "",
    `User concept: ${input.prompt}`,
  ].filter(Boolean).join("\n");
}

export function normalizeProviderError(error: unknown): LogoImageError {
  if (error instanceof LogoImageError) return error;
  const detail = error as { status?: number; code?: string; type?: string; name?: string; cause?: unknown } | undefined;
  if (detail?.cause instanceof LogoImageError) return detail.cause;
  const refusalCodes = ["moderation_error", "content_policy_violation", "moderation_blocked", "safety_violation"];
  if (detail?.status === 403 || refusalCodes.includes(detail?.type ?? "") || refusalCodes.includes(detail?.code ?? "")) return new LogoImageError("REFUSED");
  if (detail?.status === 401 || detail?.status === 402 || detail?.status === 404) return new LogoImageError("UNAVAILABLE");
  if (detail?.status === 429) return new LogoImageError("RATE_LIMITED");
  if (detail?.status === 408 || ["AbortError", "APIUserAbortError", "APIConnectionTimeoutError"].includes(detail?.name ?? "")) return new LogoImageError("TIMEOUT");
  return new LogoImageError("PROVIDER_FAILED");
}

// Bound the decoded HTTP body before the SDK parses JSON/base64. Never log it.
export function boundedProviderFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, init);
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_PROVIDER_BYTES) {
      await response.body?.cancel();
      throw new LogoImageError("INVALID_IMAGE");
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_PROVIDER_BYTES) throw new LogoImageError("INVALID_IMAGE");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers });
  };
}

export type LogoProvider = (prompt: string, signal: AbortSignal) => Promise<unknown>;

export function extractPoeImageUrl(output: unknown): URL {
  const result = output as { choices?: Array<{ finish_reason?: unknown; message?: { role?: unknown; content?: unknown } }> } | null;
  if (!Array.isArray(result?.choices) || result.choices.length !== 1) throw new LogoImageError("INVALID_IMAGE");
  const choice = result.choices[0];
  if (choice?.finish_reason === "content_filter") throw new LogoImageError("REFUSED");
  if (choice?.finish_reason !== "stop" || choice.message?.role !== "assistant") throw new LogoImageError("INVALID_IMAGE");
  const content = choice.message.content;
  // Poe chat completions return media as a Markdown image link. No HTML, other links, or text-only output.
  let urls: string[] = [];
  if (typeof content === "string" && content.length <= 4096) {
    // Poe often uses the long media URL itself as the alt label, so the alt
    // may be longer than a conventional hand-written Markdown image label.
    urls = [...content.matchAll(/!\[[^\]\r\n]{0,2048}\]\((https:\/\/[^\s<>()]{1,2048})\)/g)].map(match => match[1]);
  } else if (Array.isArray(content) && content.length === 1) {
    const part = content[0] as { type?: unknown; image_url?: { url?: unknown } } | null;
    if (part?.type === "image_url" && typeof part.image_url?.url === "string") urls = [part.image_url.url];
  }
  if (urls.length !== 1) throw new LogoImageError("INVALID_IMAGE");
  let url: URL;
  try { url = new URL(urls[0]); } catch { throw new LogoImageError("INVALID_IMAGE"); }
  if (url.protocol !== "https:" || !POE_MEDIA_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) {
    throw new LogoImageError("INVALID_IMAGE");
  }
  return url;
}

export function createPoeProvider(config: { apiKey: string }, fetcher: typeof fetch = fetch): LogoProvider {
  const client = new OpenAI({
    baseURL: POE_API_URL,
    apiKey: config.apiKey,
    maxRetries: 0, // A user action must not silently bill multiple image calls.
    timeout: GENERATION_TIMEOUT_MS,
    fetch: boundedProviderFetch(fetcher),
  });
  return async (prompt, signal) => {
    const completion = await client.chat.completions.create({
      model: LOGO_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      n: 1,
    }, { signal, timeout: GENERATION_TIMEOUT_MS });
    if (signal.aborted) throw new LogoImageError("TIMEOUT");
    const imageUrl = extractPoeImageUrl(completion);
    const response = await boundedProviderFetch(fetcher)(imageUrl, {
      method: "GET", redirect: "error", signal, headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if (!response.ok) throw new LogoImageError("PROVIDER_FAILED");
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mime && !["image/png", "image/jpeg", "image/webp", "application/octet-stream"].includes(mime)) {
      throw new LogoImageError("INVALID_IMAGE");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_PNG_BYTES) throw new LogoImageError("INVALID_IMAGE");
    try {
      const image = sharp(bytes, { limitInputPixels: 2048 * 2048, failOn: "warning" });
      const meta = await image.metadata();
      if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || !meta.width || !meta.height ||
          meta.width > 2048 || meta.height > 2048 || (meta.pages ?? 1) !== 1) throw new Error("Unsupported image");
      const png = await image.rotate().resize(1024, 1024, { fit: "contain", background: "#ffffff" }).png().toBuffer();
      if (png.length > MAX_PNG_BYTES) throw new Error("Image too large");
      return { data: [{ b64_json: png.toString("base64") }] };
    } catch {
      throw new LogoImageError("INVALID_IMAGE");
    }
  };
}

// Poe is the sole image provider. OpenAI integrations present elsewhere cannot be used as fallback.
export const poeLogoProvider: LogoProvider = async (prompt, signal) => {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) throw new LogoImageError("UNAVAILABLE");
  return createPoeProvider({ apiKey })(prompt, signal);
};

export async function validateProviderImage(output: unknown) {
  const data = (output as { data?: { b64_json?: unknown }[] } | null)?.data;
  if (!Array.isArray(data) || data.length !== 1) throw new LogoImageError("INVALID_IMAGE");
  const encoded = data[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded.length || encoded.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 ||
      encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new LogoImageError("INVALID_IMAGE");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new LogoImageError("INVALID_IMAGE");
  try {
    const image = sharp(bytes, { limitInputPixels: 1024 * 1024, failOn: "warning" });
    const meta = await image.metadata();
    if (meta.format !== "png" || meta.width !== 1024 || meta.height !== 1024 || (meta.pages ?? 1) !== 1) throw new Error("Invalid PNG dimensions");
    // Fully decode/re-encode to catch corrupt pixels and discard provider metadata.
    const png = await image.png().toBuffer();
    if (png.length > MAX_PNG_BYTES) throw new Error("PNG too large");
    return GenerateLogoImageResponse.parse({ pngBase64: png.toString("base64"), width: 1024, height: 1024 });
  } catch {
    throw new LogoImageError("INVALID_IMAGE");
  }
}

export async function generateLogo(input: ReturnType<typeof parseLogoInput>, provider: LogoProvider, signal: AbortSignal) {
  try {
    const output = await provider(composeLogoPrompt(input), signal);
    if (signal.aborted) throw new LogoImageError("TIMEOUT");
    return await validateProviderImage(output);
  } catch (error) {
    if (signal.aborted) throw new LogoImageError("TIMEOUT");
    throw normalizeProviderError(error);
  }
}
