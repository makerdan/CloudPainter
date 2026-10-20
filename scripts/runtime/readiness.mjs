import { setTimeout as delay } from "node:timers/promises";

/** Redirects, oversized bodies and stalled body streams are never healthy. */
export async function checkReady(url, { kind, basePath = "/", signal, requestMs = 700 }) {
  const bounded = AbortSignal.any([AbortSignal.timeout(requestMs), ...(signal ? [signal] : [])]);
  const response = await fetch(url, { signal: bounded, redirect: "error" });
  if (response.status !== 200) throw new Error("Readiness status mismatch");
  const type = response.headers.get("content-type") ?? "";
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Readiness body missing");
  let bytes = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 131072) throw new Error("Readiness body too large");
      text += Buffer.from(value).toString("utf8");
    }
  } finally { await reader.cancel(); }
  if (kind === "api") {
    if (!/^application\/json\b/i.test(type)) throw new Error("Readiness JSON media type mismatch");
    const body = JSON.parse(text);
    if (!body || body.status !== "ok" || Object.keys(body).length !== 1) {
      throw new Error("Readiness health contract mismatch");
    }
  } else if (kind === "cloudpainter") {
    if (!/^text\/html\b/i.test(type) || !text.includes("<title>CloudPainter</title>") ||
        !text.includes(`${basePath}@vite/client`) || !text.includes(`${basePath}src/main.tsx`)) {
      throw new Error("Readiness CloudPainter/base-path identity mismatch");
    }
  } else throw new Error("Unknown readiness contract");
}

export async function waitReady(url, options) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(options.startupMs),
    ...(options.signal ? [options.signal] : []),
  ]);
  let last;
  while (!signal.aborted) {
    try { await checkReady(url, { ...options, signal }); return; }
    catch (error) { last = error; }
    await delay(60, undefined, { signal }).catch(() => {});
  }
  throw new Error(`Service readiness deadline/cancellation: ${last?.message ?? "cancelled"}`);
}
