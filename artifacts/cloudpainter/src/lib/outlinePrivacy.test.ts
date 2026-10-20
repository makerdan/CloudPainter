import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isPhotoWideOutline, maskContours, validOutline, validRegion, viewportToProject, OutlineRequestGuard } from './outlineGeometry.ts';
import { traceEdges } from './outlineEdges.ts';

test('nonrectangular mask produces an actual ordered boundary, with closed endpoints', { timeout: 1000 }, () => {
  const mask = new Uint8Array(20 * 20);
  for (let y = 2; y < 16; y++) for (let x = 2; x < (y < 8 ? 7 : 16); x++) mask[y * 20 + x] = 1;
  const [contour] = maskContours(mask, 20, 20);
  assert.ok(validOutline(contour));
  assert.deepEqual(contour[0], contour.at(-1));
  assert.ok(contour.some(p => p.x === .35 && p.y > .1 && p.y < .4));
});

test('photo-wide framing is rejected without filtering valid large subjects by area alone', { timeout: 1000 }, () => {
  const photoWide = [{ x: .04, y: .04 }, { x: .96, y: .04 }, { x: .96, y: .96 }, { x: .04, y: .96 }, { x: .04, y: .04 }];
  const tallLargeSubject = [{ x: .08, y: .01 }, { x: .92, y: .01 }, { x: .92, y: .99 }, { x: .08, y: .99 }, { x: .08, y: .01 }];
  const wideLargeSubject = [{ x: .01, y: .08 }, { x: .99, y: .08 }, { x: .99, y: .92 }, { x: .01, y: .92 }, { x: .01, y: .08 }];
  assert.equal(isPhotoWideOutline(photoWide), true);
  assert.equal(isPhotoWideOutline(tallLargeSubject), false);
  assert.equal(isPhotoWideOutline(wideLargeSubject), false);
});

test('portrait and landscape view coordinates invert zoom and pan consistently', { timeout: 1000 }, () => {
  for (const [width, height] of [[300, 500], [500, 300]]) {
    const points = [{ x: .2, y: .3 }, { x: .5, y: .5 }, { x: .7, y: .8 }];
    const pan = { x: width * .05, y: height * -.1 }, zoom = 2;
    const visible = points.map(p => ({ x: (p.x - .5) * zoom + .5 + pan.x / width, y: (p.y - .5) * zoom + .5 + pan.y / height }));
    const mapped = viewportToProject(visible, zoom, pan.x / width, pan.y / height);
    mapped.forEach((p, i) => {
      assert.ok(Math.abs(p.x - points[i].x) < 1e-10);
      assert.ok(Math.abs(p.y - points[i].y) < 1e-10);
    });
  }
});

test('invalid regions, masks and output coordinates fail explicitly', { timeout: 1000 }, () => {
  assert.equal(validRegion({ x: .9, y: 0, width: .2, height: .5 }), false);
  assert.equal(validOutline([{ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }]), false);
  assert.throws(() => maskContours(new Uint8Array(1), 1024, 1024));
  assert.throws(() => viewportToProject([{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }], 1, 0, 0));
});

test('cancel/change identity rejects late results and new requests supersede older ones', { timeout: 1000 }, () => {
  const guard = new OutlineRequestGuard();
  const old = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(old), false);
  const next = guard.begin();
  assert.equal(guard.isCurrent(next), true);
  guard.begin();
  assert.equal(guard.isCurrent(next), false);
});

test('local worker receives pixels, uses an in-memory image and has no photo transport', { timeout: 1000 }, () => {
  const worker = readFileSync(new URL('./outline.worker.ts', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('./outlineInference.ts', import.meta.url), 'utf8');
  const edge = readFileSync(new URL('./outlineEdges.ts', import.meta.url), 'utf8');
  assert.match(worker, /new RawImage\(input.pixels/);
  assert.match(worker, /Xenova\/detr-resnet-50-panoptic/);
  assert.match(worker, /isPhotoWideOutline\(points\)/);
  assert.doesNotMatch(worker + transport + edge, /fetch\(|XMLHttpRequest|sendBeacon|\/api\/|FormData/);
  assert.match(transport, /worker\.terminate\(\)/);
});

test('hosted transport gates consent and session before photo preparation, never sends remote URLs', () => {
  const hosted = readFileSync(new URL('./outlineHosted.ts', import.meta.url), 'utf8');
  assert.ok(hosted.indexOf('if (!consent || !sessionId)') < hosted.indexOf('new Image()'));
  assert.match(hosted, /source\.startsWith\('data:image\/png;base64,'\)/);
  assert.match(hosted, /generateOutline\(\{ imageBase64, consent: true/);
  assert.match(hosted, /X-Outline-Session/);
});

test('lazy inference dependency is prebundled before the first worker run', () => {
  const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /optimizeDeps:\s*\{\s*include:\s*\['@huggingface\/transformers'\]/);
});

test('edge tracing follows actual pixel edges in portrait and landscape regions, without labels', () => {
  for (const [width, height] of [[80,120],[120,80]]) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const boundary = Math.floor(width / 2);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i+1] = pixels[i+2] = x >= boundary ? 255 : 0;
      pixels[i+3] = 255;
    }
    const candidates = traceEdges({pixels,width,height,sensitivity:.5});
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every(c => validOutline(c.points) && c.points.every(p => Math.abs(p.x - .5) <= 2 / width)));
    assert.equal(traceEdges({pixels:new Uint8ClampedArray(pixels.length),width,height,sensitivity:.5}).length, 0);
  }
  assert.throws(() => traceEdges({pixels:new Uint8ClampedArray(4),width:1024,height:1024,sensitivity:.5}));
});
