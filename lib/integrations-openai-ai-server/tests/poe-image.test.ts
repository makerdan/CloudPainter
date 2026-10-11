import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generatePoeImage, POE_IMAGE_MODELS, PoeImageError } from "../src/poe/images";
import { assertPoeMediaUrl, isPublicAddress, validatePoeMedia } from "../src/poe/media";

const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#315d4d" } }).png().toBuffer();
const jpeg = await sharp(png).jpeg().toBuffer();
const webp = await sharp(png).webp().toBuffer();
const asset = "https://pfst.cf2.poecdn.net/base/image/example.png";
const completion = { choices: [{ finish_reason: "stop", message: { role: "assistant", content: `![Generated image](${asset})` } }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const input = { model: "Nano-Banana-Pro", prompt: " A fluffy cloud " };

function fixture(response: () => Response = () => json(completion), media = { bytes: png, mime: "image/png" as "image/png" | "image/jpeg" | "image/webp" }) {
  const requests: { url: string; init: RequestInit }[] = [];
  const downloads: string[] = [];
  const deps = {
    key: () => "fake-test-key",
    fetch: (async (url: string | URL | Request, init: RequestInit = {}) => {
      requests.push({ url: String(url), init });
      return response();
    }) as typeof fetch,
    download: async (url: string) => {
      downloads.push(url);
      return media;
    },
  };
  return { deps, requests, downloads };
}

for (const [mime, bytes] of [["image/png", png], ["image/jpeg", jpeg], ["image/webp", webp]] as const) {
  test(`fully decoded ${mime} retains exact bytes and MIME`, async () => {
    const f = fixture(undefined, { bytes, mime });
    const result = await generatePoeImage(input, undefined, f.deps);
    assert.deepEqual(result, { mime, b64_json: bytes.toString("base64") });
    const decoded = await sharp(Buffer.from(result.b64_json, "base64"), { failOn: "warning" }).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([decoded.info.width, decoded.info.height], [16, 12]);
    assert.ok(decoded.data.length > 0);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.downloads, [asset]);
  });
}

const corruptPng = Buffer.from(png);
const idat = corruptPng.indexOf(Buffer.from("IDAT"));
corruptPng[idat + 5] ^= 0xff;
const corruptJpeg = Buffer.from(jpeg);
const scan = corruptJpeg.indexOf(Buffer.from([0xff, 0xda]));
corruptJpeg.fill(0, scan + 4);
const corruptWebp = Buffer.from(webp);
// Invalidate the VP8 frame tag while retaining its signature and dimensions.
corruptWebp.fill(0xff, 20, 23);
for (const [name, mime, bytes] of [
  ["exact 33-byte PNG header regression", "image/png", png.subarray(0, 33)],
  ["PNG truncated pixel stream", "image/png", png.subarray(0, idat + 6)],
  ["PNG corrupt pixels", "image/png", corruptPng],
  ["JPEG truncated scan", "image/jpeg", jpeg.subarray(0, scan + 4)],
  ["JPEG corrupt pixels", "image/jpeg", corruptJpeg],
  ["WebP truncated pixels", "image/webp", webp.subarray(0, 30)],
  ["WebP corrupt pixels", "image/webp", corruptWebp],
] as const) {
  test(`${name} fails safely after exactly one Poe request and download`, async () => {
    // The old header-only boundary accepts each of these fixtures.
    assert.equal(validatePoeMedia(bytes, mime).mime, mime);
    const f = fixture(undefined, { bytes, mime });
    await assert.rejects(generatePoeImage(input, undefined, f.deps), error => {
      assert.ok(error instanceof PoeImageError);
      assert.equal(error.code, "upstream_error");
      assert.equal(error.status, 502);
      assert.equal(error.message, "Poe image generation did not complete. No other model or provider was used.");
      return true;
    });
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, "https://api.poe.com/v1/chat/completions");
    assert.equal(JSON.parse(String(f.requests[0].init.body)).model, input.model);
    assert.deepEqual(f.downloads, [asset]);
  });
}

test("cancellation after a download cannot return late decoded pixels", async () => {
  const controller = new AbortController();
  const f = fixture();
  f.deps.download = async url => {
    f.downloads.push(url);
    controller.abort();
    return { bytes: png, mime: "image/png" };
  };
  await assert.rejects(generatePoeImage(input, controller.signal, f.deps), error =>
    error instanceof PoeImageError && error.code === "upstream_timeout");
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.downloads, [asset]);
});

test("aborting during native pixel decoding safely rejects without crashing the process", async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    "--import", "tsx", fileURLToPath(new URL("./fixtures/poe-decode-abort.ts", import.meta.url)),
  ], { timeout: 8000, maxBuffer: 64 * 1024 });
  assert.equal(stderr, "");
  assert.equal(stdout, "decode-abort-process-survived\n");
});

test("registry contains exactly the user's four Poe choices", () => {
  assert.deepEqual(Object.keys(POE_IMAGE_MODELS), ["Nano-Banana-Pro", "Nano-Banana-2", "GPT-Image-2.5-Sunburst", "Flux-2-Turbo"]);
});

for (const model of Object.keys(POE_IMAGE_MODELS)) {
  test(`${model} sends exactly one bounded request only to Poe`, async () => {
    const f = fixture();
    const result = await generatePoeImage({ ...input, model }, undefined, f.deps);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].url, "https://api.poe.com/v1/chat/completions");
    assert.equal((f.requests[0].init.headers as Record<string, string>).Authorization, "Bearer fake-test-key");
    assert.deepEqual(JSON.parse(f.requests[0].init.body as string), {
      model, messages: [{ role: "user", content: "A fluffy cloud" }], stream: false, max_tokens: 1000,
    });
    assert.equal(f.requests[0].init.redirect, "error");
    assert.ok(f.requests[0].init.signal);
    assert.deepEqual(f.downloads, [asset]);
    assert.deepEqual(result, { b64_json: png.toString("base64"), mime: "image/png" });
  });
}

test("unapproved model IDs and invalid prompts are rejected before credentials or transport", async () => {
  const f = fixture();
  f.deps.key = () => { throw new Error("Credentials must not be read."); };
  for (const bad of [{ ...input, model: "gpt-image-1" }, { ...input, model: "__proto__" }, { ...input, prompt: " " }, { ...input, prompt: "a".repeat(1001) }]) {
    await assert.rejects(generatePoeImage(bad, undefined, f.deps), error => error instanceof PoeImageError && error.code === "invalid_request");
  }
  assert.equal(f.requests.length, 0);
});

test("missing configuration fails only on operation, without a request", async () => {
  const f = fixture();
  f.deps.key = () => undefined as unknown as string;
  await assert.rejects(generatePoeImage(input, undefined, f.deps), error => error instanceof PoeImageError && error.code === "not_configured");
  assert.equal(f.requests.length, 0);
});

for (const [status, code] of [[401, "provider_rejected"], [402, "quota_exhausted"], [403, "provider_rejected"], [404, "model_unavailable"], [429, "rate_limited"], [502, "upstream_error"]] as const) {
  test(`Poe HTTP ${status} fails without retries, image fetches or alternate providers`, async () => {
    const f = fixture(() => json({ error: "sensitive-provider-body" }, status));
    await assert.rejects(generatePoeImage(input, undefined, f.deps), error => {
      assert.ok(error instanceof PoeImageError);
      assert.equal(error.code, code);
      assert.ok(!error.message.includes("sensitive-provider-body"));
      return true;
    });
    assert.equal(f.requests.length, 1);
    assert.equal(f.downloads.length, 0);
  });
}

test("malformed, oversized, non-JSON, incomplete and non-image responses fail closed", async () => {
  const invalid = [
    () => new Response("<html>error</html>", { headers: { "content-type": "text/html" } }),
    () => new Response("{", { headers: { "content-type": "application/json" } }),
    () => json({ choices: [] }),
    () => json({ choices: [{ finish_reason: "length", message: { content: `![image](${asset})` } }] }),
    () => json({ choices: [{ finish_reason: "stop", message: { content: "https://127.0.0.1/private.png" } }] }),
    () => json({ huge: "a".repeat(256_001) }),
  ];
  for (const response of invalid) {
    const f = fixture(response);
    await assert.rejects(generatePoeImage(input, undefined, f.deps), error => error instanceof PoeImageError && error.code === "invalid_output");
    assert.equal(f.downloads.length, 0);
  }
});

test("ambiguous network errors are never retried", async () => {
  const f = fixture();
  f.deps.fetch = async (...args) => {
    f.requests.push({ url: String(args[0]), init: args[1] ?? {} });
    throw new Error("connection dropped");
  };
  await assert.rejects(generatePoeImage(input, undefined, f.deps), error => error instanceof PoeImageError && error.code === "upstream_error");
  assert.equal(f.requests.length, 1);
});

test("cancelled calls make no provider request", async () => {
  const f = fixture();
  await assert.rejects(generatePoeImage(input, AbortSignal.abort(), f.deps));
  assert.equal(f.requests.length, 0);
});

test("asset URLs, private DNS addresses, file signatures and image dimensions are checked", () => {
  assert.equal(assertPoeMediaUrl(asset).hostname, "pfst.cf2.poecdn.net");
  for (const url of ["http://pfst.cf2.poecdn.net/a.png", "https://127.0.0.1/a.png", "https://pfst.cf2.poecdn.net.evil.test/a.png", "https://user:pass@pfst.cf2.poecdn.net/a.png", "https://pfst.cf2.poecdn.net:444/a.png"]) assert.throws(() => assertPoeMediaUrl(url));
  for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "fc00::1", "::ffff:127.0.0.1"]) assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(validatePoeMedia(png, "image/png").mime, "image/png");
  assert.throws(() => validatePoeMedia(png, "image/jpeg"));
  const huge = Buffer.from(png);
  huge.writeUInt32BE(100_000, 16);
  assert.throws(() => validatePoeMedia(huge, "image/png"));
});
