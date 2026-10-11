/**
 * Owner-invoked, single-request experiment. This registry authorizes ONLY this
 * synthetic-fixture probe; it does not add a model to any application route.
 * No catalogue lookup, retries, fallback, personal photos, or image payload logs.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadPoeImage } from "../../../lib/integrations-openai-ai-server/src/poe/media";

const PROBE_REGISTRY = Object.freeze({
  "GPT-Image-2": {
    endpoint: "https://api.poe.com/v1/chat/completions",
    syntheticImageEditingProbe: true,
    segmentation: "unverified",
    evidence: "https://poe.com/GPT-Image-2/api",
  },
} as const);
const SIZE = 512;
const silhouette = '<path d="M130 420 C65 340 105 260 175 225 L155 105 L230 185 C285 100 355 85 392 60 C400 150 345 195 310 220 C420 265 395 355 310 370 L260 430 Z"/>';
const hole = '<ellipse cx="245" cy="295" rx="27" ry="40" fill="black"/>';
const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${body}</svg>`;
const fixture = wrap(`<defs><linearGradient id="bg"><stop stop-color="#ddd8cc"/><stop offset="1" stop-color="#8ca09a"/></linearGradient></defs><rect width="512" height="512" fill="url(#bg)"/><circle cx="420" cy="425" r="38" fill="#2563eb"/><g fill="#ea580c">${silhouette}</g><ellipse cx="245" cy="295" rx="27" ry="40" fill="#a6afa5"/>`);
const truth = wrap(`<rect width="512" height="512" fill="black"/><g fill="white">${silhouette}</g>${hole}`);
const PROMPT = "use_mask. Return only a black-and-white segmentation mask for the orange asymmetric silhouette in the attached image. White means orange subject; black means all background, the blue circle, and the oval hole inside the orange subject. Preserve every boundary, concavity, position, and the oval hole exactly. Keep the same square field of view, without moving, redrawing, expanding, cropping, smoothing, or inventing the subject. Do not return an edited photograph, an overlay, or explanatory text. Return the mask as an image. Quality low; aspect ratio 1:1.";
const PUBLIC_FIXTURES = {
  dog: { url: "https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg", subject: "the entire dog, including its visible legs and fur; exclude grass, plants, and all background" },
  cats: { url: "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/coco_sample.png", subject: "both cats, including their ears, legs, and fur; exclude the sofa, pillows, blanket, remote controls, and all background" },
} as const;

async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.headers.get("content-type")?.startsWith("application/json") || !response.body) throw new Error("Unexpected response type.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error("Response exceeds 1 MiB."); }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

async function main() {
  if (!process.argv.includes("--approved-single-request")) throw new Error("Explicit owner approval flag required. This experiment spends Poe points.");
  const model = "GPT-Image-2";
  const entry = PROBE_REGISTRY[model];
  if (!entry?.syntheticImageEditingProbe || entry.endpoint !== "https://api.poe.com/v1/chat/completions") throw new Error("Unapproved probe.");
  const key = process.env.POE_API_KEY;
  if (!key) throw new Error("POE_API_KEY is unavailable.");
  const selectedFixture = process.argv.find(arg => arg.startsWith("--fixture="))?.slice("--fixture=".length);
  if (selectedFixture && !Object.hasOwn(PUBLIC_FIXTURES, selectedFixture)) throw new Error("Unapproved fixture.");
  const publicFixture = selectedFixture ? PUBLIC_FIXTURES[selectedFixture as keyof typeof PUBLIC_FIXTURES] : undefined;
  const out = resolve(import.meta.dirname, "../../../generated-artifacts/poe-mask-probe", selectedFixture ?? ".");
  await mkdir(out, { recursive: true });
  let source = await sharp(Buffer.from(fixture)).png().toBuffer();
  let expected: Buffer | undefined = await sharp(Buffer.from(truth)).png().toBuffer();
  let prompt = PROMPT;
  if (publicFixture) {
    const fixtureResponse = await fetch(publicFixture.url, { signal: AbortSignal.timeout(20_000) });
    if (!fixtureResponse.ok || !fixtureResponse.body) throw new Error("Public fixture unavailable.");
    const reader = fixtureResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.length;
        if (total > 5_000_000) { await reader.cancel(); throw new Error("Public fixture too large."); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    source = await sharp(Buffer.concat(chunks), { limitInputPixels: 16_777_216 })
      .rotate().resize(SIZE, SIZE, { fit: "contain", background: "#343434" }).png().toBuffer();
    expected = undefined;
    prompt = `use_mask. Return only a black-and-white segmentation mask for ${publicFixture.subject} in the attached image. White means subject; black means everything else. Preserve the original pixel positions, detailed boundary, gaps between limbs, and field of view exactly. Do not move, redraw, expand, crop, or invent any part of the subject. Return a square mask image, not an edited photo, overlay, or explanation. Quality low; aspect ratio 1:1.`;
  }
  await writeFile(resolve(out, "source.png"), source);
  if (expected) await writeFile(resolve(out, "expected-mask.png"), expected);
  const signal = AbortSignal.timeout(180_000);
  const started = performance.now();
  const response = await fetch(entry.endpoint, {
    method: "POST", redirect: "error", signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model, stream: false, quality: "low", aspect: "1:1",
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/png;base64,${source.toString("base64")}` } },
      ] }],
    }),
  });
  const summary: Record<string, unknown> = {
    model, evidence: entry.evidence, requestedAt: new Date().toISOString(),
    requestCount: 1, retryCount: 0, fixture: publicFixture?.url ?? "synthetic orange silhouette, oval hole and blue distractor",
    prompt, parameters: { quality: "low", aspect: "1:1", use_mask: "prompt keyword; not a verified API boolean" },
    httpStatus: response.status,
  };
  if (!response.ok) {
    await response.body?.cancel();
    summary.outcome = "provider_rejected";
    summary.elapsedSeconds = Math.round((performance.now() - started) / 1000);
    await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const payload = await boundedJson(response, signal);
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length > 65_536) throw new Error("Invalid provider response.");
  const urls = [...new Set(content.match(/https:\/\/(?:pfst|qph)\.cf2\.poecdn\.net\/[^\s<>"\])]+/g) ?? [])];
  summary.finishReason = payload.choices?.[0]?.finish_reason;
  summary.returnedImageCount = urls.length;
  summary.returnedText = content.replace(/https?:\/\/[^\s<>"\])]+/g, "[media URL removed]");
  summary.usage = payload.usage && {
    promptTokens: payload.usage.prompt_tokens, completionTokens: payload.usage.completion_tokens,
    totalTokens: payload.usage.total_tokens,
  };
  const expectedRaw = expected ? await sharp(expected).removeAlpha().raw().toBuffer() : undefined;
  const measurements = [];
  for (const [index, url] of urls.slice(0, 2).entries()) {
    const media = await downloadPoeImage(url, signal);
    const image = sharp(media.bytes, { limitInputPixels: 16_777_216 });
    const metadata = await image.metadata();
    const clean = await image.png().toBuffer();
    await writeFile(resolve(out, `output-${index + 1}.png`), clean);
    const raw = await sharp(clean).resize(SIZE, SIZE, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer();
    let intersection = 0, union = 0, falsePositive = 0, falseNegative = 0, nearBinary = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
      const foreground = (r + g + b) / 3 >= 128;
      const actual = expectedRaw ? expectedRaw[i * 3] >= 128 : false;
      if (foreground && actual) intersection++;
      if (foreground || actual) union++;
      if (foreground && !actual) falsePositive++;
      if (!foreground && actual) falseNegative++;
      if (Math.max(r, g, b) <= 20 || Math.min(r, g, b) >= 235) nearBinary++;
    }
    measurements.push({
      output: `output-${index + 1}.png`, width: metadata.width, height: metadata.height,
      hasAlpha: metadata.hasAlpha, foregroundIoU: expectedRaw ? Number((intersection / Math.max(1, union)).toFixed(4)) : null,
      nearBlackOrWhiteFraction: Number((nearBinary / (SIZE * SIZE)).toFixed(4)),
      falsePositivePixels: expectedRaw ? falsePositive : null, falseNegativePixels: expectedRaw ? falseNegative : null,
      note: expectedRaw ? "Measured after resizing output to the 512-square input." : "No ground-truth annotation supplied: quality requires visual review; near-binary pixels are not an accuracy score.",
    });
    const overlay = await sharp(clean).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
    const rgba = Buffer.alloc(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 60;
      rgba[i * 4 + 2] = 100;
      rgba[i * 4 + 3] = (overlay[i * 3] + overlay[i * 3 + 1] + overlay[i * 3 + 2]) / 3 >= 128 ? 110 : 0;
    }
    await sharp(source).composite([{ input: rgba, raw: { width: SIZE, height: SIZE, channels: 4 } }]).png().toFile(resolve(out, `overlay-${index + 1}.png`));
  }
  summary.measurements = measurements;
  summary.outcome = urls.length ? "image_returned_requires_visual_review" : "no_mask_image_returned";
  summary.elapsedSeconds = Math.round((performance.now() - started) / 1000);
  await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(() => {
  // Never print provider bodies, signed media locations, image payloads, or credentials.
  console.error("Poe mask experiment failed or timed out. No retry was made; a transmitted attempt may consume points.");
  process.exitCode = 1;
});
