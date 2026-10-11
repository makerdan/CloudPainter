import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { checkPaletteAccountTransition, checkPaletteDisclosure } from './account-palette.browser-fixture.mjs';

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
    const disclosure = id => page.getByTestId(`disclosure-${id}`);
    const hexDraft = page.getByTestId('input-color-hex');
    for (const id of ['color', 'size', 'opacity', 'reminder']) {
      assert.equal(await disclosure(id).getAttribute('aria-expanded'), id === 'color' ? 'true' : 'false');
    }
    for (const id of ['input-brush-size', 'input-layer-opacity']) {
      await page.getByTestId(id).evaluate(input => input.focus());
      assert.equal(await page.getByTestId(id).evaluate(input => document.activeElement === input), false);
    }
    const toggle = async (id, key) => {
      if (key) { await disclosure(id).focus(); await disclosure(id).press(key); }
      else await disclosure(id).click();
    };
    await hexDraft.fill('unfinished draft');
    await page.waitForFunction(() => localStorage.getItem('cloudpainter-project-v1') !== null);
    const projectBeforeCollapse = await page.evaluate(() => localStorage.getItem('cloudpainter-project-v1'));
    await toggle('color');
    assert.equal(await disclosure('color').getAttribute('aria-expanded'), 'false');
    await hexDraft.evaluate(input => input.focus());
    assert.equal(await hexDraft.evaluate(input => document.activeElement === input), false, 'Hidden controls cannot focus');
    await toggle('size', 'Enter');
    assert.equal(await disclosure('size').getAttribute('aria-expanded'), 'true');
    assert.equal(await disclosure('color').getAttribute('aria-expanded'), 'false');
    await toggle('color', 'Space');
    assert.equal(await hexDraft.inputValue(), 'unfinished draft');
    assert.equal(await disclosure('size').getAttribute('aria-expanded'), 'true', 'Multiple sections stay open');
    assert.equal(await page.evaluate(() => localStorage.getItem('cloudpainter-project-v1')), projectBeforeCollapse);
    await hexDraft.press('Enter');
    await toggle('color');
    await toggle('color', 'Enter');
    assert.equal(await hexDraft.inputValue(), 'unfinished draft');
    assert.equal(await hexDraft.getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator('.hex-color-feedback').innerText(), /3 or 6 hex digits/);
    await hexDraft.fill('AbC');
    await page.getByTestId('button-apply-color').click();
    assert.equal(await hexDraft.inputValue(), '#AABBCC');
    assert.match(await disclosure('color').innerText(), /#AABBCC.*BRUSH/);
    await page.keyboard.press('Tab');
    await disclosure('color').focus();
    assert.equal(await disclosure('color').evaluate(button => getComputedStyle(button).outlineStyle), 'solid');
    await toggle('reminder', 'Space');
    assert.equal(await disclosure('reminder').getAttribute('aria-expanded'), 'true');
    await toggle('reminder');
    // Real keyboard navigation through the compact picker/hex/apply row.
    await page.getByTestId('input-color-custom').focus();
    await page.keyboard.press('Tab');
    assert.equal(await hexDraft.evaluate(input => document.activeElement === input), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByTestId('button-apply-color').evaluate(button => document.activeElement === button), true);
    // Every preset remains immediately available and has an identifiable selected state.
    for (const swatch of await page.locator('.preset-color-grid .swatch').all()) {
      await swatch.click();
      assert.equal(await swatch.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.preset-color-grid [aria-pressed="true"]').count(), 1);
      const bounds = await swatch.boundingBox();
      assert.ok(bounds.width >= 24 && bounds.height >= 24);
    }
    await page.getByTestId('input-brush-size').fill('17');
    assert.match(await disclosure('size').innerText(), /17 px/);
    await toggle('size');
    await toggle('opacity', 'Enter');
    await page.getByTestId('input-layer-opacity').fill('42');
    assert.match(await disclosure('opacity').innerText(), /42%/);
    await toggle('opacity');
    await page.getByTestId('button-add-layer').click();
    assert.match(await disclosure('opacity').innerText(), /100%/);
    await page.locator('.layer-row').filter({ hasText: 'Layer 1' }).getByTestId(/button-select/).click();
    assert.match(await disclosure('opacity').innerText(), /42%/);
    await toggle('opacity');
    assert.equal(await page.getByTestId('input-layer-opacity').inputValue(), '42');
    await page.getByTestId('input-layer-opacity').fill('100');
    await toggle('opacity');
    // Return to one untouched layer for the original drawing/export assertions.
    await page.locator('.layer-row').filter({ hasText: 'Layer 2' }).getByRole('button', { name: 'Delete layer', exact: true }).click();
    await toggle('size');
    await page.getByTestId('input-brush-size').fill('8');
    await toggle('size');

    await page.getByTestId('button-tool-eraser').click();
    assert.match(await disclosure('color').innerText(), /ERASER/);
    await page.getByRole('button', { name: 'Choose White (#FFFFFF)', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Choose White (#FFFFFF)', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.getByTestId('button-tool-brush').getAttribute('class'), /selected/);

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
    assert.equal(await disclosure('color').getAttribute('aria-expanded'), 'true');
    assert.equal(await disclosure('size').getAttribute('aria-expanded'), 'false');
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
      return [...element.querySelectorAll('button,input')].filter(control => control.getClientRects().length).every(control => {
        const bounds = control.getBoundingClientRect();
        return bounds.left >= panel.left && bounds.right <= panel.right && bounds.width >= 24 && bounds.height >= 24;
      });
    }), true, 'Color controls fit on a narrow screen');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Touch disclosure toggles use the same independent state, without a menu.
    const touch = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true });
    const touchPage = await touch.newPage();
    await touchPage.goto(url);
    await touchPage.getByTestId('disclosure-color').tap();
    assert.equal(await touchPage.getByTestId('disclosure-color').getAttribute('aria-expanded'), 'false');
    await touchPage.getByTestId('disclosure-size').tap();
    assert.equal(await touchPage.getByTestId('disclosure-size').getAttribute('aria-expanded'), 'true');
    await touch.close();
    await context.close();
    await checkPaletteDisclosure(browser, url);
    await checkPaletteAccountTransition(browser, url);
  } finally {
    await browser.close();
  }
});
