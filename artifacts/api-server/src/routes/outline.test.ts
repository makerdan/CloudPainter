import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import sharp from "sharp";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createOutlineRouter } from "./outline";
import { prepareOutline, contoursFromMask, generateHostedOutline, OutlineError } from "../lib/outlineProvider";
import { ImageAccessError } from "../lib/image-budget";

const triangle = [{ x: .1, y: .2 }, { x: .8, y: .4 }, { x: .2, y: .8 }, { x: .1, y: .2 }];
const maskSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/><path fill="white" d="M80 100 L180 100 L180 220 L350 220 L350 380 L80 380Z"/><circle cx="120" cy="280" r="20" fill="black"/></svg>';
const crop = { png: Buffer.alloc(0), width: 512, height: 512, left: 0, top: 0 };
const lease = "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`;
const body = { imageBase64: Buffer.alloc(64).toString("base64"), consent: true, subject: "dog", sensitivity: .5 };
async function fixture(overrides: Partial<Parameters<typeof createOutlineRouter>[0]> = {}) {
  const calls = { reserve: 0, release: 0, generate: 0, prepare: 0 };
  const app = express();
  app.use(createOutlineRouter({
    auth: () => ({ userId: "owner-approved-fixture", sessionId: "verified-session" }),
    configured: () => true,
    budget: {
      status: async () => ({ dailyLimit: 2, remaining: 2, globalRemaining: 20 }),
      reserve: async () => { calls.reserve++; return lease; },
      release: async () => { calls.release++; },
    },
    prepare: async () => { calls.prepare++; return crop; },
    generate: async () => { calls.generate++; return { model: "GPT-Image-2", candidates: [{ label: "Subject", points: triangle }] }; },
    ...overrides,
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  return { calls, url, close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }),
    post: (value: unknown = body, headers: Record<string,string> = {}) => fetch(`${url}/outlines`, {
      method: "POST", headers: { Origin: url, "Content-Type": "application/json", "X-Outline-Session": "verified-session", ...headers },
      body: typeof value === "string" ? value : JSON.stringify(value),
    }) };
}

test("verified session, same origin and true consent required before paid transport", { timeout: 5000 }, async () => {
  const f = await fixture();
  try {
    for (const [input, headers, status] of [
      [body, { "X-Outline-Session": "old" }, 401],
      [body, { Origin: "https://evil.example" }, 403],
      [{ ...body, consent: false }, {}, 400],
      [{ ...body, subject: "" }, {}, 400],
      [{ ...body, imageUrl: "http://127.0.0.1/private" }, {}, 400],
      ["{broken", {}, 400],
      [{ ...body, imageBase64: "x".repeat(730000) }, {}, 413],
    ] as const) assert.equal((await f.post(input, headers)).status, status);
    assert.deepEqual(f.calls, { reserve: 0, release: 0, generate: 0, prepare: 0 });
  } finally { await f.close(); }
});
test("unapproved account, missing configuration, quota and invalid contours fail closed", { timeout: 5000 }, async () => {
  for (const [overrides, status] of [
    [{ auth: () => ({ userId: null, sessionId: null }) }, 401],
    [{ configured: () => false }, 503],
    [{ budget: { status: async () => { throw new ImageAccessError("authorization_denied", "Not approved", 403); }, reserve: async () => lease, release: async () => {} } }, 403],
    [{ budget: { status: async () => ({ dailyLimit: 2, remaining: 2, globalRemaining: 20 }), reserve: async () => { throw new ImageAccessError("rate_limited", "Wait", 429, 30); }, release: async () => {} } }, 429],
  ] as const) {
    const f = await fixture(overrides);
    try { assert.equal((await f.post()).status, status); assert.equal(f.calls.generate, 0); }
    finally { await f.close(); }
  }
  const f = await fixture({ generate: async () => ({ model: "GPT-Image-2", candidates: [{ label: "Bad", points: [{x: NaN,y:0}, {x:2,y:0}, {x:0,y:0}] }] }) });
  try { assert.equal((await f.post()).status, 502); assert.equal(f.calls.release, 1); } finally { await f.close(); }
});
test("valid contours and no candidates are safe; lease released on provider failure", { timeout: 5000 }, async () => {
  const f = await fixture();
  try {
    assert.equal((await f.post()).status, 200);
    assert.deepEqual(f.calls, { reserve: 1, release: 1, generate: 1, prepare: 1 });
    const config = await (await fetch(`${f.url}/outlines/config`)).json() as { allowed: boolean };
    assert.equal(config.allowed, true);
    assert.equal(f.calls.generate, 1);
  } finally { await f.close(); }
  const empty = await fixture({ generate: async () => ({ model: "GPT-Image-2", candidates: [] }) });
  try { assert.deepEqual((await (await empty.post()).json() as { candidates: unknown[] }).candidates, []); } finally { await empty.close(); }
  const failed = await fixture({ generate: async () => { throw new OutlineError("timeout", "Timed out", 504); } });
  try { assert.equal((await failed.post()).status, 504); assert.equal(failed.calls.release, 1); } finally { await failed.close(); }
});
test("photo input bounds, signatures, decoded dimensions and metadata-clean padding", { timeout: 5000 }, async () => {
  for (const input of ["https://remote.example/photo.png", "data:image/png;base64,AAAA", Buffer.from("<svg/>").toString("base64"), "A".repeat(700004)]) {
    await assert.rejects(prepareOutline(input), OutlineError);
  }
  const huge = await sharp({ create: { width: 513, height: 512, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(prepareOutline(huge.toString("base64")), OutlineError);
  const portrait = await sharp({ create: { width: 200, height: 400, channels: 3, background: "red" } }).png().toBuffer();
  const prepared = await prepareOutline(portrait.toString("base64"));
  assert.deepEqual([prepared.width,prepared.height,prepared.left,prepared.top], [200,400,156,56]);
  const meta = await sharp(prepared.png).metadata();
  assert.deepEqual([meta.width,meta.height,Boolean(meta.exif)], [512,512,false]);
});
test("actual pixel masks become closed nonrectangular contours, holes survive and bad images fail", { timeout: 5000 }, async () => {
  const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  const candidates = await contoursFromMask(mask, crop, .5);
  assert.equal(candidates.length, 2);
  assert.ok(candidates[0].points.length > 4);
  assert.deepEqual(candidates[0].points[0], candidates[0].points.at(-1));
  for (const background of ["white", "red"]) {
    const invalid = await sharp({ create: { width:512, height:512, channels:3, background } }).png().toBuffer();
    await assert.rejects(contoursFromMask(invalid, crop, .5), OutlineError);
  }
  const nonsquare = await sharp({ create: { width:100,height:200,channels:3,background:"black" } }).png().toBuffer();
  await assert.rejects(contoursFromMask(nonsquare, crop, .5), OutlineError);
});
test("fixed Poe transport, one attempt, malformed output and abort do not retry or substitute", { timeout: 5000 }, async () => {
  let attempts = 0, downloads = 0;
  const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  const deps = { key: () => "fake-test-key", fetch: (async (url, init) => {
    attempts++;
    assert.equal(url, "https://api.poe.com/v1/chat/completions");
    const input = JSON.parse(String(init?.body));
    assert.equal(input.model, "GPT-Image-2");
    assert.match(input.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "![mask](https://pfst.cf2.poecdn.net/test.png)" } }] });
  }) as typeof fetch, download: async () => { downloads++; return { bytes: mask, mime: "image/png" as const }; } };
  const result = await generateHostedOutline(crop, "dog", .5, new AbortController().signal, deps);
  assert.equal(result.candidates.length, 2);
  assert.equal(attempts, 1);
  await assert.rejects(generateHostedOutline(crop, "dog", .5, new AbortController().signal, { ...deps, fetch: async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "https://evil.example/mask.png" } }] }) }), OutlineError);
  assert.equal(downloads, 1);
  await assert.rejects(generateHostedOutline(crop, "dog", .5, new AbortController().signal, { ...deps, fetch: async () => new Response("provider secret details", { status: 402 }) }), { status: 503 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateHostedOutline(crop, "dog", .5, controller.signal, deps), { code: "cancelled" });
  assert.equal(attempts, 1);
});
test("disconnect cancels inference and releases lease without applying late output", { timeout: 5000 }, async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let aborted = false;
  const f = await fixture({ generate: async (_crop, _subject, _sensitivity, signal) => {
    started();
    await new Promise<void>(resolve => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    throw new OutlineError("cancelled", "Cancelled", 499);
  } });
  try {
    const controller = new AbortController();
    const request = fetch(`${f.url}/outlines`, { method: "POST", signal: controller.signal,
      headers: { Origin:f.url,"Content-Type":"application/json","X-Outline-Session":"verified-session" }, body:JSON.stringify(body) }).catch(() => null);
    await ready; controller.abort(); await request;
    for (let n = 0; n < 30 && !f.calls.release; n++) await new Promise(resolve => setTimeout(resolve,10));
    assert.equal(aborted, true);
    assert.equal(f.calls.release, 1);
  } finally { await f.close(); }
});
test("logging does not serialize bodies; inference contains no durable photo writes", () => {
  const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../lib/outlineProvider.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("./outline.ts", import.meta.url), "utf8");
  assert.doesNotMatch(provider + route, /writeFile|putObject|uploadObject|req\.log\.(?:info|warn|error)\([^)]*(?:body|subject|imageBase64|error)/);
  assert.match(app, /url: req\.url\?\.split/);
});
