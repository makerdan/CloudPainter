import { expect, test, type Page } from '@playwright/test';

const styles = ['round', 'chisel', 'soft', 'dry'] as const;
const key = 'cloudpainter-project-v1';
const legacy = {
  image: null, width: 1200, height: 800, selectedLayerId: 'base', title: 'Brush replay',
  layers: [{
    id: 'base', name: 'Legacy', visible: true, opacity: 1, redo: [],
    strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.1 }], color: '#ee806b', size: 12, tool: 'pen' }],
  }],
};

async function pixels(page: Page, selector: string) {
  return page.locator(selector).evaluate((node: HTMLCanvasElement) => node.toDataURL());
}

async function saved(page: Page) {
  await expect.poll(() => page.evaluate(key => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved).layers.at(-1).strokes.length : -1;
  }, key)).toBe(4);
}

test('brushes retain exact pixels across styles, undo/redo, reload and PNG export; erasing is layer-local', async ({ page }) => {
  await page.addInitScript(({ key, legacy }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(legacy));
  }, { key, legacy });
  await page.goto('/');
  const legacyPixels = await pixels(page, '[data-testid="canvas-layer-base"]');
  await page.getByTestId('button-add-layer').click();
      const canvas = page.locator('canvas.draw-surface');
  const sizeDisclosure = page.getByTestId('disclosure-size');
  if (await sizeDisclosure.count() && await sizeDisclosure.getAttribute('aria-expanded') === 'false') {
    await sizeDisclosure.click();
  }
  await page.getByTestId('input-brush-size').evaluate((input: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '24');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (const [index, style] of styles.entries()) {
    await page.getByTestId(`button-brush-${style}`).click();
    await expect(page.getByTestId(`button-brush-${style}`)).toHaveAttribute('aria-pressed', 'true');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const y = bounds!.y + bounds!.height * (0.3 + index * 0.16);
    await page.mouse.move(bounds!.x + bounds!.width * 0.15, y);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * 0.7, y, { steps: 15 });
    await page.mouse.up();
  }
  await saved(page);
  const before = await pixels(page, 'canvas.draw-surface');
  await page.getByTestId('button-brush-round').click();
  expect(await pixels(page, 'canvas.draw-surface')).toBe(before);
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page, 'canvas.draw-surface')).not.toBe(before);
  await page.getByTestId('button-redo').click();
  await expect.poll(() => pixels(page, 'canvas.draw-surface')).toBe(before);
  await saved(page);
  await page.reload();
  await expect.poll(() => pixels(page, 'canvas.draw-surface')).toBe(before);
  expect(await pixels(page, '[data-testid="canvas-layer-base"]')).toBe(legacyPixels);
  // Compare decoded export pixels to a composition of the visible layer canvases.
  await page.evaluate(() => {
    const createElement = document.createElement.bind(document);
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const node = createElement(tag, options);
      if (tag === 'a') node.click = () => { document.documentElement.dataset.exportPng = (node as HTMLAnchorElement).href; };
      return node;
    }) as typeof document.createElement;
  });
  await page.getByTestId('button-export').click();
  const identical = await page.evaluate(async () => {
    const expected = document.createElement('canvas');
    expected.width = 1200; expected.height = 800;
    const ctx = expected.getContext('2d')!;
    document.querySelectorAll<HTMLCanvasElement>('.stage canvas').forEach(canvas => ctx.drawImage(canvas, 0, 0));
    const actual = new Image();
    actual.src = document.documentElement.dataset.exportPng!;
    await actual.decode();
    const exported = document.createElement('canvas');
    exported.width = actual.width; exported.height = actual.height;
    exported.getContext('2d')!.drawImage(actual, 0, 0);
    return exported.toDataURL() === expected.toDataURL();
  });
  expect(identical).toBe(true);
  await page.getByTestId('button-tool-eraser').click();
  await canvas.scrollIntoViewIfNeeded();
  const nextBounds = await canvas.boundingBox();
  await page.mouse.move(nextBounds!.x + nextBounds!.width * 0.4, nextBounds!.y + nextBounds!.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(nextBounds!.x + nextBounds!.width * 0.4, nextBounds!.y + nextBounds!.height * 0.9, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => pixels(page, 'canvas.draw-surface')).not.toBe(before);
  expect(await pixels(page, '[data-testid="canvas-layer-base"]')).toBe(legacyPixels);
});

test('brush buttons and tap strokes work on a phone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    for (const style of styles) {
      await page.getByTestId(`button-brush-${style}`).tap();
      await expect(page.getByTestId(`button-brush-${style}`)).toHaveAttribute('aria-pressed', 'true');
      const canvas = page.locator('canvas.draw-surface');
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.touchscreen.tap(box!.x + box!.width * 0.5, box!.y + box!.height * 0.5);
    }
    await saved(page);
    const recorded = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes.map(
      (stroke: { brush: { style: string }; points: unknown[] }) => ({ style: stroke.brush.style, count: stroke.points.length }),
    ), key);
    expect(recorded).toEqual(styles.map(style => ({ style, count: 1 })));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});
