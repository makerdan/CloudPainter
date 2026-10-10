import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

// Explicitly run after Poe key configuration. This performs ONE Poe-points-consuming generation.
const domain = process.env.REPLIT_DEV_DOMAIN;
if (!domain) throw new Error("Run inside the Replit workspace to verify its routed API.");
const response = await fetch(`https://${domain}/api/logo-images`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "A simple forest-green cloud traced with one pencil line on a cream background, no lettering.", direction: "cloudline" }),
  signal: AbortSignal.timeout(100_000),
});
if (!response.ok) {
  console.error(`Live verification blocked (HTTP ${response.status}). Check the Poe connection/points and safe error response, then retry.`);
  process.exit(1);
}
const result = await response.json();
const png = Buffer.from(result.pngBase64, "base64");
const meta = await sharp(png).metadata();
if (meta.format !== "png" || meta.width !== 1024 || meta.height !== 1024) throw new Error("Invalid live PNG");
await sharp(png).raw().toBuffer();
const folder = resolve(import.meta.dirname, "../../../generated-artifacts/logo-verification");
await mkdir(folder, { recursive: true });
await writeFile(resolve(folder, "live-logo.png"), png);
console.log("Live generation and full PNG decode passed. Saved generated-artifacts/logo-verification/live-logo.png.");
