export type Point = { x: number; y: number };
export type OutlineRegion = { x: number; y: number; width: number; height: number };
export type OutlineCandidate = { label: string; points: Point[] };
export const MAX_OUTLINE_POINTS = 1024;
export const MAX_CANDIDATES = 8;

export function validRegion(region: OutlineRegion): boolean {
  return Object.values(region).every(Number.isFinite) && region.x >= 0 && region.y >= 0
    && region.width >= .03 && region.height >= .03
    && region.x + region.width <= 1.000001 && region.y + region.height <= 1.000001;
}
export function validOutline(points: Point[]): boolean {
  return points.length >= 3 && points.length <= MAX_OUTLINE_POINTS
    && points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
}
export function samplePath(points: Point[]): Point[] {
  if (points.length <= MAX_OUTLINE_POINTS) return points;
  return Array.from({ length: MAX_OUTLINE_POINTS }, (_, i) => points[Math.round(i * (points.length - 1) / (MAX_OUTLINE_POINTS - 1))]);
}
/** Ordered cell boundaries, including separate islands and holes, not rectangles. */
export function maskContours(mask: Uint8Array, width: number, height: number): Point[][] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 512 * 512 || mask.length !== width * height) throw new Error('Invalid mask dimensions.');
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const add = (a: number, b: number) => { const list = edges.get(a) ?? []; list.push(b); edges.set(a, list); };
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] > 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!filled(x, y)) continue;
    const a = y * stride + x, b = a + 1, d = a + stride, c = d + 1;
    if (!filled(x, y - 1)) add(a, b);
    if (!filled(x + 1, y)) add(b, c);
    if (!filled(x, y + 1)) add(c, d);
    if (!filled(x - 1, y)) add(d, a);
  }
  const paths: Point[][] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let at = start;
    const path: Point[] = [];
    do {
      path.push({ x: (at % stride) / width, y: Math.floor(at / stride) / height });
      const list = edges.get(at);
      if (!list?.length) break;
      const previous = at;
      at = list.pop()!;
      if (!list.length) edges.delete(previous);
    } while (at !== start && path.length <= width * height * 4);
    if (at === start && path.length >= 12) { path.push(path[0]); paths.push(path); }
  }
  // Sort BEFORE downsampling, otherwise every large loop appears equally long.
  return paths.sort((a, b) => b.length - a.length).slice(0, MAX_CANDIDATES).map(samplePath);
}
export function viewportToProject(points: Point[], zoom: number, panX: number, panY: number): Point[] {
  if (!Number.isFinite(zoom) || zoom < 1 || ![panX, panY].every(Number.isFinite)) throw new Error('Invalid view.');
  const result = points.map(p => ({ x: (p.x - .5 - panX) / zoom + .5, y: (p.y - .5 - panY) / zoom + .5 }));
  if (!validOutline(result)) throw new Error('Outline falls outside this project.');
  return result;
}
export class OutlineRequestGuard {
  private sequence = 0;
  invalidate() { this.sequence++; }
  begin() { return ++this.sequence; }
  isCurrent(request: number) { return request === this.sequence; }
}
