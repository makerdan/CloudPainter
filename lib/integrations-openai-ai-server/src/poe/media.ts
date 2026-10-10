import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import { Buffer } from "node:buffer";

const HOSTS = new Set(["pfst.cf2.poecdn.net", "qph.cf2.poecdn.net"]);
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export type PoeMedia = { bytes: Buffer; mime: ImageMime };

const privateAddresses = new BlockList();
// Keep families separate: Node also matches IPv4 through mapped IPv6 subnets.
const privateV6 = new BlockList();
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) privateAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96], ["::ffff:0:0", 96], ["fc00::", 7], ["fe80::", 10],
  ["ff00::", 8], ["2001:db8::", 32],
] as const) privateV6.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && (family === 4 || globalV6.check(address, "ipv6"))
    && !(family === 4 ? privateAddresses.check(address, "ipv4") : privateV6.check(address, "ipv6"));
}

export function assertPoeMediaUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.username || url.password
    || (url.port && url.port !== "443") || url.hash) {
    throw new Error("Poe returned an unsupported image location.");
  }
  return url;
}

export function validatePoeMedia(bytes: Buffer, contentType: string): PoeMedia {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds the allowed byte size.");
  const mime = contentType.split(";")[0].trim().toLowerCase();
  let width = 0;
  let height = 0;
  if (mime === "image/png" && bytes.length >= 33
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.toString("ascii", 12, 16) === "IHDR") {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(offset + 5);
        width = bytes.readUInt16BE(offset + 7);
        break;
      }
      offset += 2 + length;
    }
  } else if (mime === "image/webp" && bytes.length >= 30
    && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const kind = bytes.toString("ascii", 12, 16);
    if (kind === "VP8X") {
      width = bytes.readUIntLE(24, 3) + 1;
      height = bytes.readUIntLE(27, 3) + 1;
    } else if (kind === "VP8L" && bytes[20] === 0x2f) {
      width = 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8));
      height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
    } else if (kind === "VP8 " && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 20_000_000) {
    throw new Error("Poe returned an invalid or oversized raster image.");
  }
  return { bytes, mime: mime as ImageMime };
}

export async function downloadPoeImage(value: string, signal: AbortSignal): Promise<PoeMedia> {
  const url = assertPoeMediaUrl(value);
  signal.throwIfAborted();
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new Error("Image lookup stopped.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Image lookup timed out.")); }, 3000);
    signal.addEventListener("abort", abort, { once: true });
    lookup(url.hostname, { all: true }).then(
      result => { cleanup(); resolve(result); },
      error => { cleanup(); reject(error); },
    );
  });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error("Poe image address is not public.");
  }
  const selected = addresses[0];
  // Pin the validated address while retaining the original hostname for TLS.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      signal,
      family: selected.family,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
      headers: { Accept: "image/png,image/jpeg,image/webp", "Accept-Encoding": "identity" },
    }, res => {
      if (res.statusCode !== 200 || (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
        res.destroy();
        reject(new Error("Poe image could not be downloaded."));
        return;
      }
      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
        res.destroy();
        reject(new Error("Poe image exceeds the allowed byte size."));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES) res.destroy(new Error("Poe image exceeds the allowed byte size."));
        else chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => {
        try { resolve(validatePoeMedia(Buffer.concat(chunks), res.headers["content-type"] ?? "")); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Poe image download timed out.")));
    req.on("error", reject);
    req.end();
  });
}
