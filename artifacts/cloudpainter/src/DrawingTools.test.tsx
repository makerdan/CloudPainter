import { expect, test, type Page } from '@playwright/test';

const key = 'cloudpainter-project-v1';
const tools = ['brush', 'pencil', 'pen'] as const;
const pixels = (page: Page, selector = 'canvas.draw-surface') =>
  page.locator(selector).evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

async function draw(page: Page, y: number, tap = false) {
  const canvas = page.locator('canvas.draw-surface');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * y);
  await page.mouse.down();
  if (!tap) await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * y, { steps: 12 });
  await page.mouse.up();
}

async function setSize(page: Page, size: number) {
  const disclosure = page.getByTestId('disclosure-size');
  if (await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click();
  await page.getByTestId('input-brush-size').evaluate((input: HTMLInputElement, size: number) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(size));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, size);
}

test('all instruments preserve pixels, settings, layer isolation, reload, history and PNG output', async ({ page }) => {
  await page.addInitScript(key => {
    if (localStorage.getItem(key)) return;
  const photo = await page.locator('.base-photo').getAttribute('src');
    photo.width = 1200; photo.height = 800;
    const ctx = expected.getContext('2d')!;
    ctx.fillStyle = '#eef0ed'; ctx.fillRect(0, 0, 1200, 800);
    localStorage.setItem(key, JSON.stringify({
      image: photo.toDataURL(), width: 1200, height: 800, selectedLayerId: 'legacy', title: 'Instrument replay',
      layers: [{
        id: 'legacy', name: 'Legacy', visible: true, opacity: 1, redo: [],
        strokes: [
          { tool: 'pen', color: '#ee806b', size: 12, points: [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.1 }] },
          { tool: 'pen', color: '#315d4d', size: 20, brush: { style: 'dry', version: 1, seed: 42 }, points: [{ x: 0.1, y: 0.15 }, { x: 0.8, y: 0.15 }] },
        ],
      }],
    }));
  }, key);
  await page.goto('/');
  const legacy = await pixels(page, '[data-testid="canvas-layer-legacy"]');
  const photo = await page.locator('.base-photo').getAttribute('src');
  await page.getByTestId('button-add-layer').click();
  await page.getByTestId('button-brush-soft').click();
  let beforeErase = '';
  for (const [index, tool] of tools.entries()) {
    await page.getByTestId(`button-tool-${tool}`).click();
    await expect(page.getByTestId(`button-tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
    if (tool !== 'brush') await expect(page.getByTestId('disclosure-style')).toBeHidden();
    await page.getByTestId(`button-color-${index + 1}`).click();
    await expect(page.getByTestId(`button-tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
    await setSize(page, 12 + index);
    await draw(page, 0.3 + index * 0.2);
    await draw(page, 0.4 + index * 0.2, true);
  const before = await pixels(page);
    await page.getByTestId('button-undo').click();
    await expect.poll(() => pixels(page)).not.toBe(before);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => pixels(page)).toBe(before);
    beforeErase = before;
  }
  const alpha = await page.locator('canvas.draw-surface').evaluate((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d')!;
    return {
      pencil: ctx.getImageData(canvas.width * 0.45, canvas.height * 0.5, 1, 1).data[3],
      pen: ctx.getImageData(canvas.width * 0.45, canvas.height * 0.7, 1, 1).data[3],
    };
  });
  expect(alpha.pencil).toBeGreaterThan(0);
  expect(alpha.pencil).toBeLessThan(alpha.pen);
  expect(alpha.pen).toBe(255);
  await page.getByTestId('button-tool-brush').click();
  await expect(page.getByTestId('button-brush-soft')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('input-brush-size')).toHaveValue('12');
  await page.getByTestId('button-tool-pencil').click();
  await expect(page.getByTestId('input-brush-size')).toHaveValue('13');
  // Custom hex and native picker share the same instrument-preserving path.
  await page.getByTestId('input-color-hex').fill('#A1B2C3');
  await page.getByTestId('button-apply-color').click();
  await expect(page.getByTestId('button-tool-pencil')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('input-color-custom').fill('#123456');
  await expect(page.getByTestId('button-tool-pencil')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('button-tool-eraser').click();
  await setSize(page, 32);
  await draw(page, 0.3);
  await expect.poll(() => pixels(page)).not.toBe(beforeErase);
  const erased = await pixels(page);
  expect(await pixels(page, '[data-testid="canvas-layer-legacy"]')).toBe(legacy);
  expect(await page.locator('.base-photo').getAttribute('src')).toBe(photo);
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page)).toBe(beforeErase);
  await page.getByTestId('button-redo').click();
  await expect.poll(() => pixels(page)).toBe(erased);
  await page.getByTestId('button-color-5').click();
  await expect(page.getByTestId('button-tool-pencil')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('input-brush-size')).toHaveValue('13');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers.at(-1).strokes.length, key)).toBe(7);
  const records = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers.at(-1).strokes, key);
  expect(records.map((stroke: { tool: string }) => stroke.tool)).toEqual(['brush', 'brush', 'pencil', 'pencil', 'pen', 'pen', 'eraser']);
  expect(records[0].brush.style).toBe('soft');
  expect(records[2].instrument).toMatchObject({ kind: 'pencil', version: 1 });
  expect(records[4].instrument).toMatchObject({ kind: 'pen', version: 2 });
  expect(records[4].pressure).toMatchObject({ version: 1 });
  expect(records[4].pressure.samples).toHaveLength(records[4].points.length);
  expect(records[4].pressure.samples.every((pressure: number) => pressure === 0.5)).toBe(true);
  expect(records[5].pressure).toEqual({ version: 1, samples: [0.5] });
  await page.reload();
  await expect.poll(() => pixels(page)).toBe(erased);
  expect(await pixels(page, '[data-testid="canvas-layer-legacy"]')).toBe(legacy);
  await page.getByTestId('button-undo').click();
  await expect.poll(() => pixels(page)).toBe(beforeErase);
  await page.getByTestId('button-redo').click();
  await expect.poll(() => pixels(page)).toBe(erased);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('button-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Instrument-replay.png');
  const stream = (await download.createReadStream())!;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = `data:image/png;base64,${Buffer.concat(chunks).toString('base64')}`;
  expect(await page.evaluate(async png => {
    const expected = document.createElement('canvas');
    expected.width = 1200; expected.height = 800;
    const ctx = expected.getContext('2d')!;
    ctx.drawImage(document.querySelector<HTMLImageElement>('.base-photo')!, 0, 0);
    document.querySelectorAll<HTMLCanvasElement>('.stage canvas').forEach(canvas => ctx.drawImage(canvas, 0, 0));
    const image = new Image(); image.src = png; await image.decode();
    const actual = document.createElement('canvas');
    actual.width = image.width; actual.height = image.height;
    actual.getContext('2d')!.drawImage(image, 0, 0);
    return actual.toDataURL() === expected.toDataURL();
  }, png)).toBe(true);
});

test('stylus pressure is saved with each pen point and rendered into the stroke', async ({ page }) => {
  await page.goto('/');
      const canvas = page.locator('canvas.draw-surface');
  await canvas.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('disclosure-pressure-sensitivity')).toBeHidden();
  await page.getByTestId('button-tool-pen').click();
  const sensitivityDisclosure = page.getByTestId('disclosure-pressure-sensitivity');
  await expect(sensitivityDisclosure).toBeVisible();
  await expect(sensitivityDisclosure).toHaveAttribute('aria-expanded', 'false');
  await sensitivityDisclosure.click();
  const sensitivitySlider = page.getByTestId('input-pen-pressure-sensitivity');
  await sensitivitySlider.evaluate((input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, '100');
  await expect(sensitivitySlider).toHaveValue('100');
  const bounds = await canvas.evaluate((node: HTMLCanvasElement) => {
    const rect = node.getBoundingClientRect();
    node.setPointerCapture = () => {};
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  });

  const count = 513;
  expect(bounds.width).toBeGreaterThan(0);
  const before = await pixels(page);
  const dispatch = async (type: string, x: number, y: number, pressure: number) => {
    await canvas.evaluate((node: HTMLCanvasElement, event) => {
      node.dispatchEvent(new PointerEvent(event.type, {
        bubbles: true, pointerId: 91, pointerType: 'pen', button: 0, buttons: event.type === 'pointerup' ? 0 : 1,
        clientX: event.x, clientY: event.y, pressure: event.pressure,
      }));
    }, { type, x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y, pressure });
  };
  await dispatch('pointerdown', 0.2, 0.5, 0.18);
  await dispatch('pointermove', 0.5, 0.5, 0.82);
  await dispatch('pointermove', 0.8, 0.5, 0.42);
  await dispatch('pointerup', 0.8, 0.5, 0);
  await expect.poll(() => pixels(page)).not.toBe(before);
  await expect.poll(() => page.evaluate(key => {
  const saved = await page.evaluate(key => {
    const stroke = JSON.parse(localStorage.getItem(key)!).layers[0].strokes.at(-1);
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.draw-surface')!;
    const { width, height } = canvas;
    const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    const occupiedSections = Array.from({ length: 16 }, (_, section) => {
      const progress = (section + 0.5) / 16;
      const centerX = Math.round(width * (0.08 + progress * 0.84));
      const centerY = Math.round(height * (0.5 + Math.sin(progress * Math.PI * 8) * 0.12));
      for (let y = Math.max(0, centerY - 12); y <= Math.min(height - 1, centerY + 12); y++) {
        for (let x = Math.max(0, centerX - 12); x <= Math.min(width - 1, centerX + 12); x++) {
          if (data[(y * width + x) * 4 + 3] > 0) return true;
        }
      }
      return false;
    });
    return {
      points: stroke.points.length,
      pressures: stroke.pressure.samples,
      occupiedSections,
      pixels: canvas.toDataURL(),
    };
  }, key);

  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes.at(-1), key);
    const strokes = saved ? JSON.parse(saved).layers[0].strokes : [];
    return strokes.at(-1)?.pressure?.samples?.map((pressure: number) => Number(pressure.toFixed(2)));
  }, key)).toEqual([0.18, 0.82, 0.42]);
  const savedFirstStroke = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes.at(-1), key);
  expect(savedFirstStroke.pressure.sensitivity).toBe(100);

  await sensitivitySlider.evaluate((input: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(sensitivitySlider).toHaveValue('0');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes[0], key)).toEqual(savedFirstStroke);
  await dispatch('pointerdown', 0.2, 0.6, 0.18);
  await dispatch('pointermove', 0.5, 0.6, 0.82);
  await dispatch('pointerup', 0.5, 0.6, 0);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes.at(-1)?.pressure?.sensitivity, key)).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes[0], key)).toEqual(savedFirstStroke);
});

test('phone instrument buttons and tap marks remain usable without horizontal overflow', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    for (const [index, tool] of [...tools, 'eraser' as const].entries()) {
      await page.getByTestId(`button-tool-${tool}`).tap();
      await expect(page.getByTestId(`button-tool-${tool}`)).toHaveAttribute('aria-pressed', 'true');
      const canvas = page.locator('canvas.draw-surface');
      await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width * (0.2 + index * 0.15), box.y + box.height * 0.4);
    }
    await expect.poll(() => page.evaluate(key => {
      const stored = localStorage.getItem(key);

    const stroke = stored ? JSON.parse(stored).layers[0].strokes.at(-1) : null;
      return stored ? JSON.parse(stored).layers[0].strokes.length : -1;
    }, key)).toBe(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const pressure = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers[0].strokes[2].pressure, key);
    expect(pressure).toEqual({ version: 1, samples: [0.5] });
  } finally {
    await context.close();
  }
});

  const elapsed = await page.evaluate(async ({ bounds, count }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.draw-surface')!;
    const dispatch = (type: string, index: number, pressure: number) => {
      const progress = index / (count - 1);
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        pointerId: 92,
        pointerType: 'pen',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: bounds.x + bounds.width * (0.08 + progress * 0.84),
        clientY: bounds.y + bounds.height * (0.5 + Math.sin(progress * Math.PI * 8) * 0.12),
        pressure,
      }));
    };
    const started = performance.now();
    dispatch('pointerdown', 0, 0.12);
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let index = 1; index < count; index++) {
      dispatch('pointermove', index, 0.1 + ((index * 37) % 89) / 100);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    dispatch('pointerup', count - 1, 0);
    return performance.now() - started;
  }, { bounds, count });
