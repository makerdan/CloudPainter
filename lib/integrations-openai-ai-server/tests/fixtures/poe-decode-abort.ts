import assert from "node:assert/strict";
import sharp from "sharp";
import { generatePoeImage, PoeImageError } from "../../src/poe/images";

const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: "red" } }).png().toBuffer();
const controller = new AbortController();
const original = sharp.prototype.toBuffer;
let decoding = false;
let requests = 0;
let downloads = 0;
let pending: Promise<unknown> | undefined;
// Start an actual native pixel decode, then abort deterministically before its
// promise settles. Run in a child with no uncaughtException/error interception.
sharp.prototype.toBuffer = function (...args: Parameters<typeof original>) {
  const result = original.apply(this, args);
  pending = Promise.resolve(result);
  decoding = true;
  controller.abort();
  return result;
} as typeof original;
try {
  await assert.rejects(generatePoeImage({ model: "Nano-Banana-Pro", prompt: "Clouds" }, controller.signal, {
    key: () => "fake-test-key",
    fetch: async () => {
      requests++;
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "https://pfst.cf2.poecdn.net/a.png" } }] });
    },
    download: async () => {
      downloads++;
      return { bytes: png, mime: "image/png" };
    },
  }), error => error instanceof PoeImageError && error.code === "upstream_timeout" && error.status === 502);
} finally {
  sharp.prototype.toBuffer = original;
}
assert.equal(decoding, true);
assert.equal(requests, 1);
assert.equal(downloads, 1);
await pending?.catch(() => {});
// Drain the next event-loop turn: destroy(error) would have crashed by now.
await new Promise<void>(resolve => setImmediate(resolve));
process.stdout.write("decode-abort-process-survived\n");
