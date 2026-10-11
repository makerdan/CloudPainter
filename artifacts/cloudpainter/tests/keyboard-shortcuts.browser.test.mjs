import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error('Set CLOUDPAINTER_TEST_URL to the running preview.');

test('undo stays in editable text controls and still works on the drawing surface', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(url);

    const canvas = page.locator('canvas.draw-surface');
    await canvas.waitFor();
    const undo = page.getByTestId('button-undo');
    const redo = page.getByTestId('button-redo');
    await waitForStoredHistory(page, 0, 0);

    const bounds = await canvas.boundingBox();
    assert.ok(bounds);
    const x = bounds.x + bounds.width * 0.25;
    const y = bounds.y + bounds.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + bounds.width * 0.5, y + 8, { steps: 8 });
    await page.mouse.up();
    await waitForStoredHistory(page, 1, 0);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await page.evaluate(() => {
      const textarea = document.createElement('textarea');
      textarea.dataset.testid = 'undo-test-textarea';
      textarea.setAttribute('aria-label', 'Undo test textarea');
      document.body.append(textarea);

      const editable = document.createElement('div');
      editable.contentEditable = 'true';
      editable.dataset.testid = 'undo-test-contenteditable';
      editable.setAttribute('aria-label', 'Undo test editable text');
      editable.textContent = 'seed';
      document.body.append(editable);
    });

    const textarea = page.getByTestId('undo-test-textarea');
    await textarea.fill('seed');
    await textarea.press('End');
    await page.keyboard.type(' edit');
    await textarea.press('Control+z');
    assert.equal(await textarea.inputValue(), 'seed', 'textarea undo should remain native');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 });
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    const editable = page.getByTestId('undo-test-contenteditable');
    await editable.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' edit');
    await page.keyboard.press('Control+z');
    assert.equal(await editable.innerText(), 'seed', 'contenteditable undo should remain native');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 });
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    // The canvas is not normally keyboard-focusable; make it focusable here to
    // send the workspace shortcut with the drawing surface as its event target.
    await canvas.evaluate(element => {
      element.tabIndex = 0;
      element.focus();
    });
    assert.equal(await canvas.evaluate(element => document.activeElement === element), true);
    await page.keyboard.press('Control+z');
    await waitForStoredHistory(page, 0, 1);
    assert.equal(await undo.isDisabled(), true);
    assert.equal(await redo.isEnabled(), true);

    await page.keyboard.press('Control+Shift+z');
    await waitForStoredHistory(page, 1, 0);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await page.keyboard.press('Meta+z');
    await waitForStoredHistory(page, 0, 1);
    assert.equal(await undo.isDisabled(), true);
    assert.equal(await redo.isEnabled(), true);

    await page.keyboard.press('Meta+Shift+z');
    await waitForStoredHistory(page, 1, 0);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await context.close();
  } finally {
    await browser.close();
  }
});

async function storedHistory(page) {
  return page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
    const layer = project.layers?.find(item => item.id === project.selectedLayerId);
    return { strokes: layer?.strokes?.length ?? 0, redo: layer?.redo?.length ?? 0 };
  });
}

async function waitForStoredHistory(page, expectedStrokes, expectedRedo) {
  await page.waitForFunction(({ strokes, redo }) => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
    const layer = project.layers?.find(item => item.id === project.selectedLayerId);
    return layer?.strokes?.length === strokes && layer?.redo?.length === redo;
  }, { strokes: expectedStrokes, redo: expectedRedo });
}
