import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import sharp from "sharp";
import { buildPoeUpscalePrompt } from "@workspace/api-zod";
import { createImageUpscaleRouter } from "../src/routes/image-upscale.ts";
import { ImageAccessError } from "../src/lib/image-budget.ts";
import { createImagesRouter } from "../src/routes/images.ts";
import { generatePoeImage } from "@workspace/integrations-openai-ai-server/poe";
import {
  MAX_UPSCALE_INPUT_BYTES,
  POE_ASSISTANT_MODEL,
  PoeUpscaleError,
  parseUpscaleInput,
  upscaleWithPoeAssistant,
} from "../src/lib/poe-upscale.ts";

const inputPng = await sharp({ create: { width: 4, height: 3, channels: 4, background: "#315d4d" } }).png().toBuffer();
const imageUrl = "https://pfst.cf2.poecdn.net/base/image/upscale-fixture.png";
const reply = (content: unknown = `![upscaled](${imageUrl})`, finishReason = "stop") => ({
  choices: [{ finish_reason: finishReason, message: { role: "assistant", content } }],
});
const requestBody = (scale: 4 | 8 = 4) => ({ pngBase64: inputPng.toString("base64"), scale });

test("general generation maps truncated provider pixels to a safe 502, never a success or refund", async t => {
  const events: string[] = [];
  let released!: () => void;
  const releaseDone = new Promise<void>(resolve => { released = resolve; });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} } as never;
    next();
  });
  app.use("/api", createImagesRouter({
    userId: () => "fixture-owner",
    configured: () => true,
    budget: {
      status: async () => ({ dailyLimit: 2, remaining: 2, globalRemaining: 20 }),
      reserve: async () => { events.push("reserve"); return "lease-fixture"; },
      release: async id => { events.push(`release:${id}`); released(); },
    },
    generate: (input, signal) => generatePoeImage(input, signal, {
      key: () => "test-fixture-only",
      fetch: async (url, init) => {
        events.push(String(url));
        assert.equal(JSON.parse(String(init?.body)).model, "Nano-Banana-Pro");
        return Response.json(reply());
      },
      download: async url => {
        events.push(url);
        return { bytes: inputPng.subarray(0, 33), mime: "image/png" };
      },
    }),
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${origin}/api/images/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ model: "Nano-Banana-Pro", prompt: "Clouds" }),
  });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    code: "upstream_error",
    error: "Poe image generation did not complete. No other model or provider was used.",
  });
  await releaseDone;
  // Only release the concurrency lease. No persistence or refund fixture.
  assert.deepEqual(events, ["reserve", "https://api.poe.com/v1/chat/completions", imageUrl, "release:lease-fixture"]);
});

test("shared Poe Assistant prompt contract keeps the exact reviewed 4× and 8× text", () => {
  assert.deepEqual(
    [buildPoeUpscalePrompt(4), buildPoeUpscalePrompt(8)],
    ["Please upscale the attached image to be 4x", "Please upscale the attached image to be 8x"],
  );
});

function dependencies(output: Buffer, events: string[] = [], scale: 4 | 8 = 4) {
  return {
    key: () => "test-fixture-only",
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      events.push(String(url));
      assert.equal(String(url), "https://api.poe.com/v1/chat/completions");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-fixture-only");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, POE_ASSISTANT_MODEL);
      assert.equal(body.stream, false);
      assert.equal(body.n, 1);
      const inputUrl = body.messages[0].content[1].image_url.url as string;
      assert.ok(inputUrl.startsWith("data:image/png;base64,"));
      const submitted = sharp(Buffer.from(inputUrl.split(",")[1], "base64"));
      const metadata = await submitted.metadata();
      assert.deepEqual([metadata.width, metadata.height], [4, 3]);
      assert.deepEqual(await submitted.raw().toBuffer(), await sharp(inputPng).raw().toBuffer());
      assert.equal(body.messages[0].content[0].text, buildPoeUpscalePrompt(scale));
      return Response.json(reply());
    },
    download: async (url: string, signal: AbortSignal) => {
      events.push(url);
      assert.equal(url, imageUrl);
      assert.equal(signal.aborted, false);
      return { bytes: output, mime: "image/png" as const };
    },
  };
}

test("Assistant prompt route sends a single bounded image-input request and returns exact 4×/8× PNG dimensions", async () => {
  for (const scale of [4, 8] as const) {
    const expectedWidth = 4 * scale;
    const expectedHeight = 3 * scale;
    const output = await sharp({ create: { width: expectedWidth, height: expectedHeight, channels: 3, background: "#c5e1a5" } }).png().toBuffer();
    const events: string[] = [];
    const result = await upscaleWithPoeAssistant(requestBody(scale), new AbortController().signal, dependencies(output, events, scale));
    assert.deepEqual(events, ["https://api.poe.com/v1/chat/completions", imageUrl]);
    assert.equal(result.mime, "image/png");
    assert.equal(result.width, expectedWidth);
    assert.equal(result.height, expectedHeight);
    assert.equal((await sharp(Buffer.from(result.b64_json, "base64")).metadata()).format, "png");
  }
});

test("input schema is strict, bounded and accepts only 4× or 8×", () => {
  for (const invalid of [
    null, [], {}, { ...requestBody(4), extra: true }, { ...requestBody(4), scale: 2 },
    { ...requestBody(4), pngBase64: "A===" }, { ...requestBody(4), pngBase64: "not base64!" },
    { ...requestBody(4), pngBase64: "A".repeat(Math.ceil(MAX_UPSCALE_INPUT_BYTES / 3) * 4 + 4) },
  ]) assert.throws(() => parseUpscaleInput(invalid), (error: unknown) => error instanceof PoeUpscaleError && error.status === 400);
  assert.equal(parseUpscaleInput(requestBody(8)).scale, 8);
});

test("no Poe call occurs for an invalid, oversized, malformed or dimension-incompatible PNG", async () => {
  let calls = 0;
  const stub = dependencies(inputPng);
  const fetch = async (...args: Parameters<typeof stub.fetch>) => { calls++; return stub.fetch(...args); };
  const tooLarge = Buffer.alloc(MAX_UPSCALE_INPUT_BYTES + 1).toString("base64");
  const largeDimensions = await sharp({ create: { width: 1100, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  for (const input of [
    { pngBase64: inputPng.subarray(0, 24).toString("base64"), scale: 4 },
    { pngBase64: tooLarge, scale: 4 },
    { pngBase64: largeDimensions.toString("base64"), scale: 8 },
  ]) {
    await assert.rejects(upscaleWithPoeAssistant(input, undefined, { ...stub, fetch }), (error: unknown) =>
      error instanceof PoeUpscaleError && error.status === 400);
  }
  assert.equal(calls, 0);
});

test("provider refusal, missing image, unsafe link, wrong dimensions and API errors fail without retries", async () => {
  const output = await sharp({ create: { width: 16, height: 12, channels: 3, background: "red" } }).png().toBuffer();
  for (const [payload, status, message] of [
    [reply("I cannot use Topaz."), 200, "invalid image"],
    [reply(`![bad](https://evil.test/image.png)`), 200, "unsafe URL"],
    [reply(`![filtered](${imageUrl})`, "content_filter"), 200, "moderation"],
  ] as const) {
    let calls = 0;
    const deps = {
      ...dependencies(output),
      fetch: async () => { calls++; return Response.json(payload, { status }); },
    };
    await assert.rejects(upscaleWithPoeAssistant(requestBody(), undefined, deps), (error: unknown) => error instanceof PoeUpscaleError);
    assert.equal(calls, 1);
  }
  const wrongSize = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(upscaleWithPoeAssistant(requestBody(), undefined, dependencies(wrongSize)), (error: unknown) =>
    error instanceof PoeUpscaleError && error.code === "invalid_output");
  for (const status of [401, 402, 403, 404, 429, 500]) {
    let calls = 0;
    const deps = {
      ...dependencies(output),
      fetch: async () => { calls++; return Response.json({ error: { message: "private prompt" } }, { status }); },
    };
    await assert.rejects(upscaleWithPoeAssistant(requestBody(), undefined, deps), (error: unknown) => {
      assert.ok(error instanceof PoeUpscaleError);
      assert.doesNotMatch(error.message, /private prompt/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("upstream cancellation stops the request and is never retried", async () => {
  const controller = new AbortController();
  let calls = 0;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const deps = {
    ...dependencies(inputPng),
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      started();
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")), { once: true }));
    },
  };
  const operation = upscaleWithPoeAssistant(requestBody(), controller.signal, deps);
  await began;
  controller.abort();
  await assert.rejects(operation, (error: unknown) => error instanceof PoeUpscaleError && error.code === "upstream_timeout");
  assert.equal(calls, 1);
});

async function serve(
  t: Parameters<Parameters<typeof test>[1]>[0],
  options: {
    userId?: string | null;
    configured?: boolean;
    upscale?: typeof upscaleWithPoeAssistant;
    budget?: { status: (userId: string) => Promise<unknown>; reserve: (userId: string) => Promise<string>; release: (id: string) => Promise<void> };
  } = {},
) {
  const attempts: string[] = [];
  const budget = options.budget ?? {
    status: async (userId: string) => { attempts.push(`status:${userId}`); return { remaining: 1 }; },
    reserve: async (userId: string) => { attempts.push(`reserve:${userId}`); return "lease-1"; },
    release: async (id: string) => { attempts.push(`release:${id}`); },
  };
  const app = express().use("/api", createImageUpscaleRouter({
    userId: req => options.userId === undefined ? req.get("x-user") ?? null : options.userId,
    configured: () => options.configured ?? true,
    upscale: options.upscale ?? (async () => ({ b64_json: "aGVsbG8=", mime: "image/png", width: 16, height: 12 })),
    budget: budget as never,
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { url: `http://127.0.0.1:${address.port}/api/images/upscale`, attempts };
}

const post = (url: string, body: unknown = requestBody(), headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: new URL(url).origin, "x-user": "owner", ...headers }, body: JSON.stringify(body) });

test("route enforces authentication, same origin, approved account and budget before Poe transport", async t => {
  let providerCalls = 0;
  const { url, attempts } = await serve(t, { upscale: async () => { providerCalls++; return { b64_json: "aGVsbG8=", mime: "image/png", width: 16, height: 12 }; } });
  assert.equal((await post(url, requestBody(), { "x-user": "" })).status, 401);
  assert.equal((await post(url, requestBody(), { Origin: "https://attacker.test" })).status, 403);
  assert.equal((await post(url, requestBody(), { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await post(url, { ...requestBody(), scale: 3 })).status, 400);
  assert.equal(providerCalls, 0);
  const valid = await post(url);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "no-store");
  assert.deepEqual(await valid.json(), { b64_json: "aGVsbG8=", mime: "image/png", width: 16, height: 12 });
  assert.deepEqual(attempts, ["status:owner", "reserve:owner", "release:lease-1"]);
  assert.equal(providerCalls, 1);
});

test("route fails closed when Poe is unconfigured or approved-account budget is unavailable", async t => {
  let providerCalls = 0;
  const unconfigured = await serve(t, { configured: false, upscale: async () => { providerCalls++; return {} as never; } });
  assert.equal((await post(unconfigured.url)).status, 503);
  assert.equal(providerCalls, 0);
  const denied = await serve(t, {
    budget: {
      status: async () => { throw new ImageAccessError("authorization_denied", "not approved", 403); },
      reserve: async () => "never",
      release: async () => {},
    },
    upscale: async () => { providerCalls++; return {} as never; },
  });
  assert.equal((await post(denied.url)).status, 403);
  assert.equal(providerCalls, 0);
});

test("route request parser rejects oversized JSON with a safe response", async t => {
  const { url } = await serve(t);
  const response = await post(url, { pngBase64: "A".repeat(12 * 1024 * 1024), scale: 4 });
  assert.equal(response.status, 413);
  assert.doesNotMatch(await response.text(), /SyntaxError|pngBase64/);
});
