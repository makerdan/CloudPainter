import { POE_IMAGE_MODELS, isPoeImageModel } from "./models";
import { assertPoeMediaUrl, downloadPoeImage, validatePoeMedia, type PoeMedia } from "./media";

export { POE_IMAGE_MODELS, isPoeImageModel } from "./models";
export { assertPoeMediaUrl, downloadPoeImage, MAX_IMAGE_BYTES, validatePoeMedia, type PoeMedia } from "./media";
export class PoeImageError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502) {
    super(message);
    this.name = "PoeImageError";
  }
}

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

export function isPoeConfigured(): boolean {
  return Boolean(process.env.POE_API_KEY);
}

function providerError(status: number): PoeImageError {
  if (status === 402) return new PoeImageError("quota_exhausted", "Poe points are exhausted. Check your Poe account.", 503);
  if (status === 429) return new PoeImageError("rate_limited", "Poe is limiting requests. Please try again later.", 429);
  if (status === 401 || status === 403) return new PoeImageError("provider_rejected", "Poe could not authorize this request. Check the linked key and account.", 503);
  if (status === 404) return new PoeImageError("model_unavailable", "The selected model is unavailable through Poe. No replacement model was used.", 503);
  if (status === 400) return new PoeImageError("invalid_request", "Poe could not generate this image. Try a different prompt.", 400);
  if (status === 408) return new PoeImageError("upstream_timeout", "Poe generation timed out. It was not retried.");
  return new PoeImageError("upstream_error", "Poe image generation did not complete. No other provider was used.");
}

async function readProviderJson(response: Response, limit: number): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !response.body) {
    await response.body?.cancel();
    throw new PoeImageError("invalid_output", "Poe returned an unsupported response.");
  }
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body.cancel();
    throw new PoeImageError("invalid_output", "Poe returned an oversized response.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PoeImageError("invalid_output", "Poe returned an oversized response.");
      }
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof PoeImageError) throw error;
    throw new PoeImageError("invalid_output", "Poe returned an invalid response.");
  } finally {
    reader.releaseLock();
  }
}

function imageUrlFromResponse(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)
    || payload.choices.length !== 1) throw new PoeImageError("invalid_output", "Poe did not return a generated image.");
  const choice = payload.choices[0];
  if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string"
    || choice.message.content.length > 65_536 || choice.message.tool_calls?.length) {
    throw new PoeImageError("invalid_output", "Poe did not return a complete generated image.");
  }
  const urls = choice.message.content.match(/https:\/\/(?:pfst|qph)\.cf2\.poecdn\.net\/[^\s<>"\])]+/g) as string[] | null;
  if (!urls?.length) throw new PoeImageError("invalid_output", "Poe did not return a supported image download. No replacement model was used.");
  for (const url of urls) {
    try { return assertPoeMediaUrl(url).href; } catch { /* Reject untrusted locations. */ }
  }
  throw new PoeImageError("invalid_output", "Poe returned an unsupported image location.");
}

export async function generatePoeImage(
  input: { model: string; prompt: string },
  callerSignal?: AbortSignal,
  dependencies: Dependencies = defaults,
): Promise<{ b64_json: string; mime: PoeMedia["mime"] }> {
  // Repeat authorization at the transport boundary; never trust the picker alone.
  if (!isPoeImageModel(input.model)) throw new PoeImageError("invalid_request", "Choose one of the four approved Poe models.", 400);
  const model = POE_IMAGE_MODELS[input.model];
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > model.maxPromptCharacters) throw new PoeImageError("invalid_request", "Enter a prompt between 1 and 1,000 characters.", 400);
  const key = dependencies.key();
  if (!key) throw new PoeImageError("not_configured", "Poe is not configured. Add or link POE_API_KEY in this project's Secrets.", 503);
  const deadline = AbortSignal.timeout(model.timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  try {
    signal.throwIfAborted();
    // One request only. Ambiguous failures must not retry or change providers.
    const response = await dependencies.fetch("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model: model.model, messages: [{ role: "user", content: prompt }], stream: false, max_tokens: 1000 }),
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerError(response.status);
    }
    const payload = await readProviderJson(response, model.maxResponseBytes);
    const url = imageUrlFromResponse(payload);
    const mediaSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const downloaded = await dependencies.download(url, mediaSignal);
    const image = validatePoeMedia(downloaded.bytes, downloaded.mime);
    return { b64_json: image.bytes.toString("base64"), mime: image.mime };
  } catch (error) {
    if (signal.aborted) throw new PoeImageError("upstream_timeout", "Poe generation was stopped or timed out. It was not retried.");
    if (error instanceof PoeImageError) throw error;
    throw new PoeImageError("upstream_error", "Poe image generation did not complete. No other model or provider was used.");
  }
}
