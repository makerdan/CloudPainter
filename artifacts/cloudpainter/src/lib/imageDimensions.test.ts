import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fitDimensionsWithinBounds,
  fitStageDimensions,
  getScaledImageDimensions,
} from './imageDimensions.ts';

function assertSameAspectRatio(actual: { width: number; height: number }, expected: { width: number; height: number }) {
  assert.ok(Math.abs(actual.width / actual.height - expected.width / expected.height) < 0.001);
}

test('scales landscape and portrait imports under the cap without changing their proportions', () => {
  const landscape = getScaledImageDimensions(6000, 4000);
  const portrait = getScaledImageDimensions(3000, 5000);

  assert.deepEqual(landscape, { width: 2000, height: 1333 });
  assert.deepEqual(portrait, { width: 1200, height: 2000 });
  assertSameAspectRatio(landscape, { width: 6000, height: 4000 });
  assertSameAspectRatio(portrait, { width: 3000, height: 5000 });
});

test('keeps small imports at their original dimensions', () => {
  assert.deepEqual(getScaledImageDimensions(320, 180), { width: 320, height: 180 });
});

test('fits landscape and portrait stages inside a height-constrained editor', () => {
  const landscape = fitStageDimensions(2000, 1000, 700, 300);
  const portrait = fitStageDimensions(1000, 2000, 700, 300);

  assert.deepEqual(landscape, { width: 600, height: 300 });
  assert.deepEqual(portrait, { width: 150, height: 300 });
  assertSameAspectRatio(landscape, { width: 2000, height: 1000 });
  assertSameAspectRatio(portrait, { width: 1000, height: 2000 });
});

test('applies the stage width cap without distorting the project ratio', () => {
  const stage = fitStageDimensions(2400, 1600, 1400, 1200);

  assert.deepEqual(stage, { width: 900, height: 600 });
  assertSameAspectRatio(stage, { width: 2400, height: 1600 });
});

test('contains the reference image inside exported project dimensions', () => {
  const exportedImage = fitDimensionsWithinBounds(3000, 2000, 1200, 801);

  assert.equal(exportedImage.width, 1200);
  assert.equal(exportedImage.height, 800);
  assert.ok(exportedImage.height <= 801);
  assertSameAspectRatio(exportedImage, { width: 3000, height: 2000 });
});
