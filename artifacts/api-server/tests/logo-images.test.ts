import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import sharp from "sharp";
import {
  MAX_PROVIDER_BYTES, LogoImageError, boundedProviderFetch, composeLogoPrompt,
  createPoeProvider, extractPoeImageUrl, generateLogo, normalizeProviderError, parseLogoInput, validateProviderImage,
} from "../src/lib/logo-images.ts";
import { createLogoImagesRouter } from "../src/routes/logo-images.ts";

const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#315d4d" } }).png().toBuffer();
const success = { data: [{ b64_json: png.toString("base64") }] };
const input = parseLogoInput({ prompt: "A cloud drawn in one pencil line", direction: "cloudline" });
const signal = new AbortController().signal;
const poeImageUrl = "https://pfst.cf2.poecdn.net/base/image/fixture.png";
const poeReply = (content: unknown = `![generated concept](${poeImageUrl})`, finish_reason = "stop") => ({
  choices: [{ message: { role: "assistant", content }, finish_reason }],
});

test("input is bounded, trimmed, strict and text-only", () => {
  for (const body of [{}, { prompt: " " }, { prompt: "x".repeat(1201) }, { prompt: 4 },
    { prompt: "ok", direction: "other" }, { prompt: "ok", image: "private photo" },
    { prompt: "ok", model: "arbitrary" }, { prompt: "ok", url: "https://evil.test" },
    { prompt: "ok", project: { layers: [] } }]) {
    assert.throws(() => parseLogoInput(body), (e: unknown) => e instanceof LogoImageError && e.code === "INVALID_INPUT");
  }
  assert.equal(parseLogoInput({ prompt: "  cloud  " }).prompt, "cloud");
  assert.equal(parseLogoInput({ prompt: "x".repeat(1200) }).prompt.length, 1200);
});

test("all five original inspirations are text-only, not photo conditioning", () => {
  for (const direction of ["cloudline", "viewfinder", "gesture", "paperfold", "sunstudy"]) {
    const prompt = composeLogoPrompt(parseLogoInput({ prompt: "my concept", direction }));
    assert.match(prompt, /Text-only inspiration:/);
    assert.match(prompt, /User concept: my concept/);
  }
});

test("Poe-only SDK contract uses a fixed image bot and fetches its bounded CDN image", async () => {
  const calls: string[] = [];
  const provider = createPoeProvider({ apiKey: "test-fixture-only" }, async (url, init) => {
    calls.push(String(url));
    assert.ok(init?.signal);
    if (calls.length === 1) {
      assert.equal(String(url), "https://api.poe.com/v1/chat/completions");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-fixture-only");
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "n", "stream"]);
      assert.equal(body.model, "flux-2-turbo");
      assert.equal(body.stream, false);
      assert.equal(body.n, 1);
      assert.deepEqual(body.messages.map((m: { role: unknown }) => m.role), ["user"]);
      assert.match(body.messages[0].content, /Cloudline/);
      assert.doesNotMatch(JSON.stringify(body), /private photo|sketch project/);
      return Response.json(poeReply());
    }
    assert.equal(String(url), poeImageUrl);
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  });
  const result = await generateLogo(input, provider, signal);
  assert.deepEqual(calls, ["https://api.poe.com/v1/chat/completions", poeImageUrl]);
  assert.equal(result.width, 1024);
  assert.equal((await sharp(Buffer.from(result.pngBase64, "base64")).metadata()).format, "png");
});

test("Poe errors (moderation, missing points, authentication, timeout and outage) are safe, with no automatic retry", async () => {
  for (const [status, providerType, expected] of [
    [403, "moderation_error", "REFUSED"], [401, "authentication_error", "UNAVAILABLE"],
    [402, "insufficient_credits", "UNAVAILABLE"], [404, "not_found_error", "UNAVAILABLE"],
    [408, "timeout_error", "TIMEOUT"], [429, "rate_limit_error", "RATE_LIMITED"],
    [500, "provider_error", "PROVIDER_FAILED"],
  ] as const) {
    let calls = 0;
    const provider = createPoeProvider({ apiKey: "test-fixture-only" }, async () => {
      calls++;
      return Response.json({ error: { message: "PRIVATE PROMPT AND CREDENTIAL", code: status, type: providerType } }, { status });
    });
    await assert.rejects(generateLogo(input, provider, signal), (e: unknown) => {
      assert.ok(e instanceof LogoImageError);
      assert.equal(e.code, expected);
      assert.doesNotMatch(JSON.stringify(e.toJSON()), /PRIVATE|CREDENTIAL/);
      return true;
    });
    assert.equal(calls, 1);
  }
  assert.equal(normalizeProviderError({ status: 400, type: "invalid_request_error", code: "content_policy_violation" }).code, "REFUSED");
  assert.equal(normalizeProviderError({ name: "APIConnectionTimeoutError" }).code, "TIMEOUT");
});

test("Poe SDK passes cancellation to the HTTP request and does not retry an aborted generation", async () => {
  const controller = new AbortController();
  let aborted = false;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  const provider = createPoeProvider({ apiKey: "test-fixture-only" }, async (_url, init) => {
    calls++;
    started();
    return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("abort", "AbortError"));
    }));
  });
  const request = generateLogo(input, provider, controller.signal);
  await began;
  controller.abort();
  await assert.rejects(request, (e: unknown) => e instanceof LogoImageError && e.code === "TIMEOUT");
  assert.equal(aborted, true);
  assert.equal(calls, 1);
});

test("Poe text-only output, multiple images, non-Poe links and redirects never become image fetches", async () => {
  const longPoeImage = `${poeImageUrl}?media=${"a".repeat(280)}`;
  assert.equal(extractPoeImageUrl(poeReply(`![${longPoeImage}](${longPoeImage})`)).href, longPoeImage);
  for (const output of [
    {}, poeReply("I cannot make that"), poeReply(`![one](${poeImageUrl}) ![two](${poeImageUrl})`),
    poeReply("![malicious](http://127.0.0.1/secret)"), poeReply("![bad](https://pfst.cf2.poecdn.net.evil.test/image.png)"),
    poeReply("![bad](https://api.poe.com/internal.png)"), poeReply("![bad](https://u:p@pfst.cf2.poecdn.net/image.png)"),
    poeReply("![bad](https://pfst.cf2.poecdn.net:8443/image.png)"),
    poeReply("![bad](https://pfst.cf2.poecdn.net/image.png#fragment)"),
    poeReply(`![bad](${poeImageUrl})`, "length"), poeReply(`![bad](${poeImageUrl})`, "content_filter"),
  ]) {
    await assert.rejects(Promise.resolve().then(() => extractPoeImageUrl(output)), (error: unknown) =>
      error instanceof LogoImageError && ["INVALID_IMAGE", "REFUSED"].includes(error.code));
  }
  const structured = poeReply([{ type: "image_url", image_url: { url: poeImageUrl } }]);
  assert.equal(extractPoeImageUrl(structured).href, poeImageUrl);

  let calls = 0;
  const provider = createPoeProvider({ apiKey: "test-fixture-only" }, async (_url, init) => {
    calls++;
    return init?.method === "POST" ? Response.json(poeReply("Nothing generated")) : new Response(png);
  });
  await assert.rejects(generateLogo(input, provider, signal), (e: unknown) => e instanceof LogoImageError && e.code === "INVALID_IMAGE");
  assert.equal(calls, 1);
});

test("Poe image fetch rejects untrusted redirects, oversized bodies, HTML and corrupt pixels", async () => {
  for (const mediaResponse of [
    new Response("<html>private</html>", { headers: { "Content-Type": "text/html" } }),
    new Response(png.subarray(0, 32), { headers: { "Content-Type": "image/png" } }),
    new Response(new Uint8Array(MAX_PROVIDER_BYTES + 1), { headers: { "Content-Type": "image/png" } }),
  ]) {
    let calls = 0;
    const provider = createPoeProvider({ apiKey: "test-fixture-only" }, async (_url, init) => {
      calls++;
      if (calls === 1) return Response.json(poeReply());
      assert.equal(init?.redirect, "error");
      return mediaResponse;
    });
    await assert.rejects(generateLogo(input, provider, signal), (e: unknown) =>
      e instanceof LogoImageError && e.code === "INVALID_IMAGE");
    assert.equal(calls, 2);
  }
  let calls = 0;
  const provider = createPoeProvider({ apiKey: "test-fixture-only" }, async (_url, init) => {
    calls++;
    if (calls === 1) return Response.json(poeReply());
    assert.equal(init?.redirect, "error");
    throw new TypeError("redirect mode is set to error");
  });
  await assert.rejects(generateLogo(input, provider, signal), (e: unknown) =>
    e instanceof LogoImageError && e.code === "PROVIDER_FAILED");
  assert.equal(calls, 2);
});

test("PNG output rejects malformed base64, URLs, oversized data, corrupt pixels and wrong dimensions", async () => {
  const small = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } }).png().toBuffer();
  const wrongHeader = Buffer.from(png);
  wrongHeader.writeUInt32BE(2048, 16);
  for (const output of [
    null, {}, { data: [] }, { data: [success.data[0], success.data[0]] },
    { data: [{ url: "https://arbitrary.test/image.png" }] },
    { data: [{ b64_json: "invalid!" }] }, { data: [{ b64_json: "A".repeat(11_184_816) }] },
    { data: [{ b64_json: small.toString("base64") }] },
    { data: [{ b64_json: png.subarray(0, 48).toString("base64") }] },
    { data: [{ b64_json: wrongHeader.toString("base64") }] },
  ]) {
    await assert.rejects(validateProviderImage(output), (e: unknown) => e instanceof LogoImageError && e.code === "INVALID_IMAGE");
  }
});

test("HTTP response is bounded even without a content-length header", async () => {
  for (const declared of [false, true]) {
    const providerFetch = boundedProviderFetch(async () => new Response(new Uint8Array(MAX_PROVIDER_BYTES + 1), {
      headers: declared ? { "content-length": String(MAX_PROVIDER_BYTES + 1) } : {},
    }));
    await assert.rejects(providerFetch("https://provider.test"), (e: unknown) => e instanceof LogoImageError && e.code === "INVALID_IMAGE");
  }
});

async function serve(t: Parameters<Parameters<typeof test>[1]>[0], options: Parameters<typeof createLogoImagesRouter>[0]) {
  const app = express().use("/api", createLogoImagesRouter(options));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}/api/logo-images`;
}
const post = (url: string, body: unknown = { prompt: "cloud" }, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("API success validates image and cache/privacy headers, without accepting extra payloads", async t => {
  const requests: string[] = [];
  const url = await serve(t, { provider: async prompt => { requests.push(prompt); return success; } });
  const response = await post(url, { prompt: "one cloud" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal((await response.json()).height, 1024);
  assert.equal((await post(url, { prompt: "cloud", image: "private" })).status, 400);
  assert.equal((await post(url, { prompt: "cloud" }, { "sec-fetch-site": "cross-site" })).status, 400);
  assert.equal(requests.length, 1);
  assert.doesNotMatch(requests[0], /private/);
});

test("API rejects empty, oversized and invalid JSON before any provider request", async t => {
  let calls = 0;
  const url = await serve(t, { provider: async () => { calls++; return success; } });
  assert.equal((await post(url, { prompt: "" })).status, 400);
  assert.equal((await post(url, { prompt: "x".repeat(1201) })).status, 400);
  assert.equal((await post(url, { prompt: "x".repeat(9000) })).status, 413);
  const broken = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{private broken" });
  assert.equal(broken.status, 400);
  assert.doesNotMatch(await broken.text(), /private|SyntaxError/);
  assert.equal(calls, 0);
});

test("API refusal and missing configuration remain safe retryable messages", async t => {
  for (const code of ["REFUSED", "UNAVAILABLE", "INVALID_IMAGE"] as const) {
    const url = await serve(t, { provider: async () => { throw new LogoImageError(code); } });
    const response = await post(url);
    const error = await response.json();
    assert.equal(error.code, code);
    assert.equal(error.retryable, code !== "REFUSED");
    assert.doesNotMatch(JSON.stringify(error), /apiKey|stack|test-fixture/);
  }
  const url = await serve(t, { provider: async () => { throw new Error("PRIVATE provider internals"); } });
  assert.doesNotMatch(await (await post(url)).text(), /PRIVATE/);
});

test("rate limits reset and concurrency blocks duplicate calls", async t => {
  let clock = 10;
  const rateUrl = await serve(t, { provider: async () => success, perIpLimit: 1, now: () => clock });
  assert.equal((await post(rateUrl)).status, 200);

  const globalUrl = await serve(t, { provider: async () => success, globalLimit: 1, perIpLimit: 10 });
  assert.equal((await post(globalUrl)).status, 200);
  assert.equal((await post(globalUrl)).status, 429);
  const limited = await post(rateUrl);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  clock += 600_001;
  assert.equal((await post(rateUrl)).status, 200);

  let resolve!: (value: unknown) => void;
  let started!: () => void;
  const began = new Promise<void>(r => { started = r; });
  const url = await serve(t, { concurrency: 1, provider: async () => { started(); return new Promise(r => { resolve = r; }); } });
  const first = post(url);
  await began;
  const busy = await post(url);
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).code, "BUSY");
  resolve(success);
  assert.equal((await first).status, 200);
});

test("timeout aborts provider and retains its concurrency slot until it actually stops", async t => {
  let aborted = false;
  let resolve!: (value: unknown) => void;
  const url = await serve(t, { timeoutMs: 20, concurrency: 1, provider: async (_prompt, signal) => {
    signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(r => { resolve = r; });
  } });
  const response = await post(url);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "TIMEOUT");
  assert.equal(aborted, true);
  assert.equal((await (await post(url)).json()).code, "BUSY");
  resolve(success);
});

test("disconnect aborts provider without sending a late image", async t => {
  let started!: () => void;
  const began = new Promise<void>(r => { started = r; });
  let stopped!: () => void;
  const ended = new Promise<void>(r => { stopped = r; });
  const url = await serve(t, { provider: async (_prompt, signal) => {
    started();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { stopped(); reject(new Error("cancelled")); }));
  } });
  const controller = new AbortController();
  const request = fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "cloud" }), signal: controller.signal }).catch(() => {});
  await began;
  controller.abort();
  await ended;
  await request;
});
