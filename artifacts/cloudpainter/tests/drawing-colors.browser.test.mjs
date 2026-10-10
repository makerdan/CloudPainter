import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

// Reuse the existing preview; never launch a separate application server.
const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error('Set CLOUDPAINTER_TEST_URL to the running preview.');

test('preset and custom colors survive drawing, undo/redo, reload and PNG export', { timeout: 240_000 }, async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(url);
    await page.getByTestId('selected-color').waitFor();
    assert.equal(await page.locator('.swatch').count(), 24);

    await page.getByTestId('button-tool-eraser').click();
    await page.getByRole('button', { name: 'Choose White (#FFFFFF)', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Choose White (#FFFFFF)', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.getByTestId('button-tool-pen').getAttribute('class'), /selected/);

    const colors = ['#ffffff', '#dc2626', '#12abcf', '#445566'];
    const points = [];
    const hexInput = page.getByTestId('input-color-hex');
    for (let index = 0; index < colors.length; index++) {
      const color = colors[index];
      if (index === 1) await page.getByRole('button', { name: 'Choose Red (#DC2626)', exact: true }).click();
      if (index === 2) {
        await hexInput.fill(' 12AbCf ');
        await hexInput.press('Enter');
        assert.equal(await hexInput.inputValue(), '#12ABCF');
        await hexInput.fill('not a color');
        await page.getByTestId('button-apply-color').click();
        assert.equal(await hexInput.getAttribute('aria-invalid'), 'true');
        assert.match(await page.getByTestId('selected-color').innerText(), /#12ABCF/);
      }
      if (index === 3) {
        await page.getByTestId('input-color-custom').fill(color);
        assert.equal(await hexInput.inputValue(), '#445566');
      }
      const canvas = page.locator('canvas.draw-surface');
      await canvas.scrollIntoViewIfNeeded();
      const bounds = await canvas.boundingBox();
      assert.ok(bounds);
      const x = bounds.x + bounds.width * (0.2 + index * 0.18);
      const y = bounds.y + bounds.height * 0.45;
      points.push({ x: Math.floor((x - bounds.x) / bounds.width * 1200), y: 360 });
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 10, y, { steps: 3 });
      await page.mouse.up();
    }
    const pixel = async point => page.locator('canvas.draw-surface').evaluate((canvas, point) =>
      [...canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data], point);
    const expected = colors.map(color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).concat(255));
    for (let index = 0; index < points.length; index++) assert.deepEqual(await pixel(points[index]), expected[index]);
    await page.getByTestId('button-undo').click();
    assert.equal((await pixel(points[3]))[3], 0);
    await page.getByTestId('button-redo').click();
    assert.deepEqual(await pixel(points[3]), expected[3]);
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
      return project.layers?.[0]?.strokes?.length === 4;
    });
    await page.reload();
    await page.locator('canvas.draw-surface').waitFor();
    await page.waitForFunction(() => document.querySelector('canvas.draw-surface')?.getContext('2d').getImageData(888, 360, 1, 1).data[3] === 255);
    for (let index = 0; index < points.length; index++) assert.deepEqual(await pixel(points[index]), expected[index]);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('button-export').click();
    const download = await downloadPromise;
    const output = new URL('../../../generated-artifacts/drawing-colors.png', import.meta.url);
    await mkdir(new URL('./', output), { recursive: true });
    await download.saveAs(output.pathname);
    const dataUrl = `data:image/png;base64,${(await readFile(output)).toString('base64')}`;
    const exported = await page.evaluate(async ({ dataUrl, points }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      return points.map(point => [...ctx.getImageData(point.x, point.y, 1, 1).data]);
    }, { dataUrl, points });
    assert.deepEqual(exported, expected);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator('.drawing-colors').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.drawing-colors').evaluate(element => {
      const panel = element.getBoundingClientRect();
      return [...element.querySelectorAll('button,input')].every(control => {
        const bounds = control.getBoundingClientRect();
        return bounds.left >= panel.left && bounds.right <= panel.right;
      });
    }), true, 'Color controls fit on a narrow screen');
    await context.close();
  } finally {
    await browser.close();
  }
});
