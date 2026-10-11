import { Buffer } from "node:buffer";
import sharp from "sharp";
import {
  assertPoeMediaUrl,
  downloadPoeImage,
  MAX_IMAGE_BYTES,
  validatePoeMedia,
  type PoeMedia,
} from "@workspace/integrations-openai-ai-server/poe";

export const POE_ASSISTANT_MODEL = "assistant";
export const MAX_UPSCALE_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_UPSCALE_OUTPUT_DIMENSION = 8192;
export const MAX_UPSCALE_PIXELS = 20_000_000;
export const UPSCALE_TIMEOUT_MS = 120_000;
const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class PoeUpscaleError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502) {
    super(message);
    this.name = "PoeUpscaleError";
  }
}

type Input = { pngBase64: string; scale: 4 | 8 };
type Output = { b64_json: string; mime: "image/png"; width: number; height: number };
type Dependencies = {
  key: () => string | undefined;
  fetch: typeof globalThis.fetch;
  download: (url: string, signal: AbortSignal) => Promise<PoeMedia>;
};

const defaults: Dependencies = {
  key: () => process.env.POE_API_KEY,
  fetch: (...args) => globalThis.fetch(...args),
  download: downloadPoeImage,
};

function fail(code: string, message: string, status = 502): never {
  throw new PoeUpscaleError(code, message, status);
}

export function parseUpscaleInput(value: unknown): Input {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("invalid_request", "Choose 4× or 8× and provide a valid PNG image.", 400);
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(",") !== "pngBase64,scale"
    || typeof body.pngBase64 !== "string"
    || body.pngBase64.length === 0
    || body.pngBase64.length > Math.ceil(MAX_UPSCALE_INPUT_BYTES / 3) * 4
    || body.pngBase64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.pngBase64)
    || (body.scale !== 4 && body.scale !== 8)) {
    return fail("invalid_request", "Choose 4× or 8× and provide a valid PNG image.", 400);
  }
  const bytes = Buffer.from(body.pngBase64, "base64");
  if (!bytes.length || bytes.length > MAX_UPSCALE_INPUT_BYTES || bytes.toString("base64") !== body.pngBase64) {
    return fail("invalid_request", "Choose 4× or 8× and provide a valid PNG image.", 400);
  }
  return { pngBase64: body.pngBase64, scale: body.scale };
}

async function validateInput(input: Input): Promise<{ bytes: Buffer; width: number; height: number }> {
  const bytes = Buffer.from(input.pngBase64, "base64");
  try {
    const image = sharp(bytes, { limitInputPixels: 4_194_304, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height
      || metadata.width > 2048 || metadata.height > 2048 || (metadata.pages ?? 1) !== 1
      || metadata.width * input.scale > MAX_UPSCALE_OUTPUT_DIMENSION
      || metadata.height * input.scale > MAX_UPSCALE_OUTPUT_DIMENSION
      || metadata.width * metadata.height * input.scale ** 2 > MAX_UPSCALE_PIXELS) {
      throw new Error("Unsupported PNG dimensions");
    }
    const decoded = await image.png().toBuffer();
    if (!decoded.subarray(0, 8).equals(PNG_SIGNATURE) || decoded.length > MAX_UPSCALE_INPUT_BYTES) {
      throw new Error("Invalid PNG bytes");
    }
    return { bytes: decoded, width: metadata.width, height: metadata.height };
  } catch {
    return fail("invalid_request", "The image must be a readable PNG within the supported size and dimensions.", 400);
  }
}

function providerError(status: number): PoeUpscaleError {
  if (status === 402) return new PoeUpscaleError("quota_exhausted", "Poe points are exhausted. Check the connected Poe account.", 503);
  if (status === 429) return new PoeUpscaleError("rate_limited", "Poe is limiting requests. Please try again later.", 429);
  if (status === 401 || status === 403 || status === 404) {
    return new PoeUpscaleError("provider_unavailable", "Poe Assistant could not process this image. It was not retried.", 503);
  }
  if (status === 400) return new PoeUpscaleError("invalid_request", "Poe Assistant could not accept this image.", 400);
  return new PoeUpscaleError("provider_failed", "Poe Assistant did not complete the upscale. It was not retried.");
}

async function readProviderJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !response.body) {
    await response.body?.cancel();
    return fail("invalid_output", "Poe Assistant returned an unsupported response.");
  }
  if (Number(response.headers.get("content-length")) > MAX_PROVIDER_RESPONSE_BYTES) {
    await response.body.cancel();
    return fail("invalid_output", "Poe Assistant returned an oversized response.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        return fail("invalid_output", "Poe Assistant returned an oversized response.");
      }
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof PoeUpscaleError) throw error;
    return fail("invalid_output", "Poe Assistant returned an invalid response.");
  } finally {
    reader.releaseLock();
  }
}

function imageUrlFromResponse(payload: unknown): URL {
  const result = payload as {
    choices?: Array<{ finish_reason?: unknown; message?: { role?: unknown; content?: unknown; tool_calls?: unknown } }>;
  } | null;
  if (!Array.isArray(result?.choices) || result.choices.length !== 1) {
    return fail("invalid_output", "Poe Assistant did not return one upscaled image.");
  }
  const choice = result.choices[0];
  if (choice?.finish_reason === "content_filter") return fail("refused", "Poe Assistant could not accept this image.", 422);
  if (choice?.finish_reason !== "stop" || choice.message?.role !== "assistant" || choice.message.tool_calls) {
    return fail("invalid_output", "Poe Assistant did not return a complete image.");
  }
  const content = choice.message.content;
  let urls: string[] = [];
  if (typeof content === "string" && content.length <= 4096) {
    urls = [...content.matchAll(/!\[[^\]\r\n]{0,2048}\]\((https:\/\/[^\s<>()]{1,2048})\)/g)].map(match => match[1]);
  } else if (Array.isArray(content) && content.length === 1) {
    const part = content[0] as { type?: unknown; image_url?: { url?: unknown } } | null;
    if (part?.type === "image_url" && typeof part.image_url?.url === "string") urls = [part.image_url.url];
  }
  if (urls.length !== 1) return fail("invalid_output", "Poe Assistant did not return one downloadable image.");
  try {
    return assertPoeMediaUrl(urls[0]);
  } catch {
    return fail("invalid_output", "Poe Assistant returned an unsupported image location.");
  }
}

export function buildUpscalePrompt(scale: 4 | 8): string {
  return `Please upscale the attached image to be ${scale}x`;
}

export async function validateUpscaleRequest(value: unknown): Promise<Input> {
  const input = parseUpscaleInput(value);
  await validateInput(input);
  return input;
}

async function validateOutput(media: PoeMedia, width: number, height: number, scale: 4 | 8): Promise<Output> {
  try {
    const validated = validatePoeMedia(media.bytes, media.mime);
    const image = sharp(validated.bytes, { limitInputPixels: MAX_UPSCALE_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    const expectedWidth = width * scale;
    const expectedHeight = height * scale;
    if (!metadata.width || !metadata.height || metadata.width !== expectedWidth || metadata.height !== expectedHeight
      || (metadata.pages ?? 1) !== 1) throw new Error("Unexpected dimensions");
    const png = await image.png().toBuffer();
    if (png.length > MAX_IMAGE_BYTES || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Invalid PNG");
    return { b64_json: png.toString("base64"), mime: "image/png", width: expectedWidth, height: expectedHeight };
  } catch {
    return fail("invalid_output", `Poe Assistant did not return a readable ${width * scale}×${height * scale} image. No download was created.`);
  }
}

export async function upscaleWithPoeAssistant(
  rawInput: unknown,
  callerSignal?: AbortSignal,
  dependencies: Dependencies = defaults,
): Promise<Output> {
  const input = parseUpscaleInput(rawInput);
  const source = await validateInput(input);
  const key = dependencies.key();
  if (!key) return fail("not_configured", "Poe is not configured on the server.", 503);
  const deadline = AbortSignal.timeout(UPSCALE_TIMEOUT_MS);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  try {
    signal.throwIfAborted();
    const response = await dependencies.fetch("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: POE_ASSISTANT_MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: buildUpscalePrompt(input.scale) },
            { type: "image_url", image_url: { url: `data:image/png;base64,${source.bytes.toString("base64")}` } },
          ],
        }],
        stream: false,
        n: 1,
        max_tokens: 1000,
      }),
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerError(response.status);
    }
    const payload = await readProviderJson(response);
    const url = imageUrlFromResponse(payload);
    const mediaSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const media = await dependencies.download(url.href, mediaSignal);
    return await validateOutput(media, source.width, source.height, input.scale);
  } catch (error) {
    if (signal.aborted) return fail("upstream_timeout", "Poe Assistant was stopped or timed out. The request was not retried.", 504);
    if (error instanceof PoeUpscaleError) throw error;
    return fail("provider_failed", "Poe Assistant did not complete the upscale. The request was not retried.");
  }
}
