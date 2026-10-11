import { MAX_CANDIDATES, samplePath, type OutlineCandidate } from '@workspace/outline-core';

/** Follow nearby image gradients, with no recognition model or network transport. */
export function traceEdges(input: { pixels: Uint8ClampedArray; width: number; height: number; sensitivity: number }): OutlineCandidate[] {
  const { pixels, width, height, sensitivity } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width * height > 512 * 512 || pixels.length !== width * height * 4
    || !Number.isFinite(sensitivity) || sensitivity < .1 || sensitivity > .9) throw new Error('Invalid edge input.');
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114;
  const edge = new Uint8Array(gray.length);
  const threshold = 240 * (1 - sensitivity) + 30;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const gx = -gray[i - width - 1] + gray[i - width + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + width - 1] + gray[i + width + 1];
    const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
    if (Math.hypot(gx, gy) >= threshold) edge[i] = 1;
  }
  const paths: { x: number; y: number }[][] = [];
  for (let i = 0; i < edge.length; i++) {
    if (!edge[i]) continue;
    let at = i;
    const path: { x: number; y: number }[] = [];
    while (edge[at]) {
      edge[at] = 0;
      const x = at % width, y = Math.floor(at / width);
      path.push({ x: x / width, y: y / height });
      let next = -1;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && edge[ny * width + nx]) { next = ny * width + nx; break; }
      }
      if (next < 0) break;
      at = next;
    }
    if (path.length >= 16) paths.push(path);
  }
  return paths.sort((a, b) => b.length - a.length).slice(0, MAX_CANDIDATES)
    .map((points, i) => ({ label: `Edge path ${i + 1}`, points: samplePath(points) }));
}
