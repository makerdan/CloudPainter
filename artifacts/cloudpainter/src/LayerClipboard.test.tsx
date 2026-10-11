import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const key = 'cloudpainter-project-v1';
const line = (tool: string, color: string, y: number, metadata = {}) => ({
  tool, color, size: 26, points: [{ x: 0.15, y }, { x: 0.85, y }], ...metadata,
});
const fixture = {
  image: null, width: 1200, height: 800, selectedLayerId: 'source', title: 'Clipboard replay',
  photoZoom: 1, photoPan: { x: 0, y: 0 },
  layers: [
    { id: 'dest', name: 'Destination', visible: true, opacity: 0.65, redo: [], strokes: [line('pen', '#0000ff', 0.3)] },
    { id: 'source', name: 'Source', visible: true, opacity: 0.4, redo: [], strokes: [
      line('pen', '#ff0000', 0.3),
      { tool: 'eraser', color: '#000000', size: 50, points: [{ x: 0.5, y: 0.3 }] },
      ...(['round', 'soft', 'dry', 'chisel'] as const).map((style, i) => line('brush', '#315d4d', 0.4 + i * 0.07, { brush: { style, version: 1, seed: 17 } })),
      line('pencil', '#ee806b', 0.75, { instrument: { kind: 'pencil', version: 1, seed: 42 } }),
      line('pen', '#ee806b', 0.85, { instrument: { kind: 'pen', version: 1, seed: 19 } }),
    ] },
  ],
};
const pixels = (page: Page, id: string) => page.getByTestId(`canvas-layer-${id}`).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key);
async function initialize(page: Page, data = fixture) {
  await page.addInitScript(({ key, data }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
  }, { key, data });
  await page.goto('/');
  await expect(page.getByTestId('button-copy-drawing')).toBeVisible();
}
async function composite(page: Page, images: string[]) {
  return page.evaluate(async images => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 800;
    for (const url of images) {
      const image = new Image(); image.src = url; await image.decode();
      canvas.getContext('2d')!.drawImage(image, 0, 0);
    }
    return canvas.toDataURL();
  }, images);
}

test('copy mixed tools between populated layers; isolation, source deletion, atomic history, recopy, reload and PNG', async ({ page }) => {
  await initialize(page);
  await expect(page.getByTestId('button-paste-drawing')).toBeDisabled();
  const src = await pixels(page, 'source'), dest = await pixels(page, 'dest');
  const expected = await composite(page, [dest, src]);
  await page.getByTestId('button-copy-drawing').click();
  expect(await pixels(page, 'source')).toBe(src);
  // Edit source after copy, then copy an empty source cannot discard prior clipboard.
  await page.getByTestId('button-clear-layer').click();
  await expect(page.getByTestId('button-copy-drawing')).toBeDisabled();
  await expect(page.getByTestId('button-paste-drawing')).toBeEnabled();
  await page.getByTestId('button-select-layer-dest').click();
  await page.getByTestId('button-paste-drawing').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(expected);
  expect(await page.getByTestId('canvas-layer-dest').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(600, 240, 1, 1).data))).toEqual([0, 0, 255, 255]);
  await expect.poll(async () => (await stored(page))?.layers[0].strokes.length).toBe(2);
  expect((await stored(page)).layers[0].opacity).toBe(0.65);
  await page.getByTestId('button-delete-layer-source').click();
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(dest);
  await page.getByTestId('button-redo').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(expected);
  // Further pastes use the same independent clipboard, even after source deletion.
  await page.getByTestId('button-paste-drawing').click();
  const twice = await composite(page, [expected, src]);
  await expect.poll(() => pixels(page, 'dest')).toBe(twice);
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(expected);
  // Copying a destination that already contains a paste retains nested isolation.
  await page.getByTestId('button-copy-drawing').click();
  await page.getByTestId('button-paste-drawing').click();
  const nested = await composite(page, [expected, expected]);
  await expect.poll(() => pixels(page, 'dest')).toBe(nested);
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(expected);
  await expect.poll(async () => (await stored(page))?.layers[0].redo[0]?.kind).toBe('paste');
  await page.reload();
  await expect(page.getByTestId('button-paste-drawing')).toBeDisabled();
  await expect.poll(() => pixels(page, 'dest')).toBe(expected);
  await page.getByTestId('button-redo').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(nested);
  await page.getByTestId('button-undo').click();
  // Drawing undo still removes one ordinary stroke, not the preceding paste.
  const canvas = page.getByTestId('canvas-layer-dest');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.95);
  await expect.poll(() => pixels(page, 'dest')).not.toBe(expected);
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page, 'dest')).toBe(expected);
  const exportExpected = await page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('[data-testid="canvas-layer-dest"]')!;
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d')!; ctx.globalAlpha = 0.65; ctx.drawImage(source, 0, 0);
    return canvas.toDataURL();
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export').click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(await composite(page, [`data:image/png;base64,${bytes.toString('base64')}`])).toBe(exportExpected);
  await page.getByTestId('button-copy-drawing').click();
  await page.getByTestId('button-blank').click();
  await expect(page.getByTestId('button-copy-drawing')).toBeDisabled();
  await expect(page.getByTestId('button-paste-drawing')).toBeDisabled();
});

test('missing selected layer never copies or pastes into a fallback layer', async ({ page }) => {
  await initialize(page, { ...fixture, selectedLayerId: 'deleted' });
  await expect(page.getByTestId('button-copy-drawing')).toBeDisabled();
  await expect(page.getByTestId('button-paste-drawing')).toBeDisabled();
  await page.getByTestId('button-select-layer-source').click();
  await page.getByTestId('button-copy-drawing').click();
  await page.getByTestId('button-delete-layer-source').click();
  await expect(page.getByTestId('button-paste-drawing')).toBeEnabled();
  await page.getByTestId('button-paste-drawing').click();
  await expect.poll(async () => (await stored(page))?.layers[0].strokes.length).toBe(2);
});

test('phone copy and paste controls stay labeled and usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initialize(page);
  await page.getByTestId('button-copy-drawing').click();
  await page.getByTestId('button-select-layer-dest').click();
  await page.getByTestId('button-paste-drawing').click();
  await expect.poll(async () => (await stored(page))?.layers[0].strokes.length).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
