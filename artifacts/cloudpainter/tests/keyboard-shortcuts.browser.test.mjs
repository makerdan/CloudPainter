import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error('Set CLOUDPAINTER_TEST_URL to the running preview.');

test('undo and redo shortcuts stay native in editable text controls and work on the drawing surface', { timeout: 60_000 }, async () => {
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

    const shortcutHint = page.locator('.statusbar .hint');
    const shortcutHintText = await shortcutHint.innerText();
    assert.match(shortcutHintText, /⌘\/Ctrl Z/);
    assert.match(shortcutHintText, /⌘\/Ctrl Y/);
    assert.match(shortcutHintText, /⇧⌘\/Ctrl Z/);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const hintBounds = await shortcutHint.boundingBox();
      assert.ok(hintBounds && hintBounds.x >= 0 && hintBounds.x + hintBounds.width <= width);
      assert.equal(
        await shortcutHint.evaluate(element => element.scrollWidth <= element.clientWidth),
        true,
        `shortcut guidance should wrap without horizontal overflow at ${width}px`,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        `the page should not overflow horizontally at ${width}px`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

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
      window.undoShortcutDefaults = [];
      window.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
          window.undoShortcutDefaults.push(event.defaultPrevented);
        }
      });

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

      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.testid = 'undo-test-input';
      input.setAttribute('aria-label', 'Undo test input');
      input.value = 'seed';
      document.body.append(input);

      const select = document.createElement('select');
      select.dataset.testid = 'undo-test-select';
      select.setAttribute('aria-label', 'Undo test select');
      select.innerHTML = '<option value="first">First</option><option value="second">Second</option>';
      document.body.append(select);
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
    await textarea.press('Control+y');
    assert.equal(await textarea.inputValue(), 'seed edit', 'textarea redo should remain native');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 });

    const input = page.getByTestId('undo-test-input');
    await input.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' edit');
    await page.keyboard.press('Control+z');
    assert.equal(await input.inputValue(), 'seed', 'input undo should remain native');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 });
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await page.keyboard.press('Control+Shift+z');
    assert.equal(await input.inputValue(), 'seed edit', 'input redo should remain native');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 });
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await page.evaluate(() => {
      window.undoTestShortcutEvents = [];
      window.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          window.undoTestShortcutEvents.push({
            targetTag: event.target?.tagName,
            defaultPrevented: event.defaultPrevented,
          });
        }
      });
    });
    const select = page.getByTestId('undo-test-select');
    for (const shortcut of ['Control+z', 'Control+Shift+z', 'Meta+z', 'Meta+Shift+z']) {
      await select.focus();
      assert.equal(
        await select.evaluate(element => document.activeElement === element),
        true,
        `select should be focused before ${shortcut}`,
      );
      await page.keyboard.press(shortcut);
    }
    assert.equal(await select.inputValue(), 'first', 'undo/redo shortcuts should not change the select');
    assert.deepEqual(
      await page.evaluate(() => window.undoTestShortcutEvents),
      Array.from({ length: 4 }, () => ({ targetTag: 'SELECT', defaultPrevented: false })),
      'the workspace should not cancel undo/redo events targeted at a select',
    );
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
    await page.keyboard.press('Control+y');
    assert.equal(await editable.innerText(), 'seed edit', 'contenteditable redo should remain native');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 });
    await page.keyboard.press('Meta+y');
    assert.deepEqual(await storedHistory(page), { strokes: 1, redo: 0 }, 'Cmd+Y in editable text must not change drawing history');
    assert.deepEqual(await page.evaluate(() => window.undoShortcutDefaults), [false, false, false], 'redo shortcuts in editable text must not be prevented');

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

    await page.keyboard.press('Control+y');
    await waitForStoredHistory(page, 1, 0);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await page.keyboard.press('Control+z');
    await waitForStoredHistory(page, 0, 1);
    await page.keyboard.press('Control+Shift+z');
    await waitForStoredHistory(page, 1, 0);

    await page.keyboard.press('Meta+z');
    await waitForStoredHistory(page, 0, 1);
    assert.equal(await undo.isDisabled(), true);
    assert.equal(await redo.isEnabled(), true);

    await page.keyboard.press('Meta+y');
    await waitForStoredHistory(page, 1, 0);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    await page.keyboard.press('Meta+z');
    await waitForStoredHistory(page, 0, 1);
    await page.keyboard.press('Meta+Shift+z');
    await waitForStoredHistory(page, 1, 0);
    assert.equal(await undo.isEnabled(), true);
    assert.equal(await redo.isDisabled(), true);

    // Build two layers with independent histories, then alternate real keyboard
    // shortcuts across them. Each action must stay with the selected layer.
    await addSyntheticStroke(page);
    await waitForStoredHistory(page, 2, 0);
    const firstLayerId = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
      return project.selectedLayerId;
    });
    assert.ok(firstLayerId);
    await page.getByTestId('button-add-layer').click();
    await page.waitForFunction(firstId => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
      return project.layers?.length === 2 && project.selectedLayerId !== firstId;
    }, firstLayerId);
    const secondLayerId = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
      return project.selectedLayerId;
    });
    assert.ok(secondLayerId);
    await addSyntheticStroke(page);
    await waitForStoredHistory(page, 1, 0);

    const historyBaseline = await page.evaluate(() => JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}'));
    const expectedProject = JSON.parse(JSON.stringify(historyBaseline));
    const findExpectedLayer = id => expectedProject.layers.find(layer => layer.id === id);
    const firstExpected = findExpectedLayer(firstLayerId);
    const secondExpected = findExpectedLayer(secondLayerId);
    assert.ok(firstExpected && secondExpected);
    assert.equal(firstExpected.strokes.length, 2);
    assert.equal(secondExpected.strokes.length, 1);

    const waitForExpectedHistories = async selectedLayerId => {
      expectedProject.selectedLayerId = selectedLayerId;
      await page.waitForFunction(expected => {
        const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
        return JSON.stringify(project) === JSON.stringify(expected);
      }, expectedProject);
      const project = await page.evaluate(() => JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}'));
      assert.deepEqual(project, expectedProject);
    };

    // Undo the second layer, switch layers, then undo the first layer.
    await page.getByTestId(`button-select-layer-${secondLayerId}`).click();
    await page.keyboard.press('Control+z');
    secondExpected.redo.push(secondExpected.strokes.pop());
    await waitForExpectedHistories(secondLayerId);

    await page.getByTestId(`button-select-layer-${firstLayerId}`).click();
    await page.keyboard.press('Meta+z');
    firstExpected.redo.push(firstExpected.strokes.pop());
    await waitForExpectedHistories(firstLayerId);

    // Redo each layer after switching selection; Y and Shift+Z must restore
    // each stroke only to the layer whose redo stack owns it.
    await page.getByTestId(`button-select-layer-${secondLayerId}`).click();
    await page.keyboard.press('Control+y');
    secondExpected.strokes.push(secondExpected.redo.pop());
    await waitForExpectedHistories(secondLayerId);

    await page.getByTestId(`button-select-layer-${firstLayerId}`).click();
    await page.keyboard.press('Meta+Shift+z');
    firstExpected.strokes.push(firstExpected.redo.pop());
    await waitForExpectedHistories(firstLayerId);

    // Confirm Cmd+Y also follows the selected layer after another layer switch.
    await page.keyboard.press('Meta+z');
    firstExpected.redo.push(firstExpected.strokes.pop());
    await waitForExpectedHistories(firstLayerId);

    await page.getByTestId(`button-select-layer-${secondLayerId}`).click();
    await page.keyboard.press('Control+z');
    secondExpected.redo.push(secondExpected.strokes.pop());
    await waitForExpectedHistories(secondLayerId);
    await page.keyboard.press('Meta+y');
    secondExpected.strokes.push(secondExpected.redo.pop());
    await waitForExpectedHistories(secondLayerId);

    await page.getByTestId(`button-select-layer-${firstLayerId}`).click();
    await waitForExpectedHistories(firstLayerId);
    await page.reload();
    await canvas.waitFor();
    await waitForExpectedHistories(firstLayerId);

    await context.close();
  } finally {
    await browser.close();
  }
});

test('keyboard undo and redo flush the exact project before an immediate reload', { timeout: 60_000 }, async () => {
  const browser = await launchShortcutTestBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const canvas = await createHistoryPhotoProject(page, 2);
    const original = await storedProject(page);
    const originalLayer = selectedLayer(original);
    assert.equal(originalLayer.strokes.length, 2);
    assert.equal(originalLayer.redo.length, 0);
    assert.equal(original.referencePhotoVisible, false);
    assert.equal(original.referencePhotoOpacity, 37);

    await focusDrawingSurface(canvas);
    await holdDebouncedProjectSaves(page);
    await page.keyboard.press('Control+z');
    await waitForHistoryButtons(page, true, true);
    await nextAnimationFrame(page);
    assert.equal(await storedProjectText(page), JSON.stringify(original), 'undo should remain pending until page exit');
    assert.ok(await heldSaveCount(page));

    const afterUndo = structuredClone(original);
    const undoLayer = selectedLayer(afterUndo);
    undoLayer.redo.push(undoLayer.strokes.pop());
    await page.reload();
    await assertReloadedProject(page, afterUndo);
    await assertPhotoSettings(page, afterUndo);
    await waitForHistoryButtons(page, true, true);

    // Let the newly mounted page finish its initial no-op autosave before
    // suspending only the next debounce window.
    await page.waitForTimeout(600);
    const beforeRedo = await storedProject(page);
    await focusDrawingSurface(page.locator('canvas.draw-surface'));
    await holdDebouncedProjectSaves(page);
    await page.keyboard.press('Control+y');
    await waitForHistoryButtons(page, true, false);
    await nextAnimationFrame(page);
    assert.equal(await storedProjectText(page), JSON.stringify(beforeRedo), 'redo should remain pending until page exit');
    assert.ok(await heldSaveCount(page));

    const afterRedo = structuredClone(beforeRedo);
    const redoLayer = selectedLayer(afterRedo);
    redoLayer.strokes.push(redoLayer.redo.pop());
    await page.reload();
    await assertReloadedProject(page, afterRedo);
    await assertPhotoSettings(page, afterRedo);
    await waitForHistoryButtons(page, true, false);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('rapid keyboard history sequences persist their final stroke and redo stacks before reload', { timeout: 60_000 }, async () => {
  const browser = await launchShortcutTestBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const canvas = await createHistoryPhotoProject(page, 3);
    const original = await storedProject(page);
    assert.equal(selectedLayer(original).strokes.length, 3);
    assert.equal(selectedLayer(original).redo.length, 0);

    await focusDrawingSurface(canvas);
    await holdDebouncedProjectSaves(page);
    const sequence = [
      ['Control+z', 'undo'],
      ['Control+z', 'undo'],
      ['Meta+y', 'redo'],
      ['Meta+z', 'undo'],
      ['Control+Shift+z', 'redo'],
    ];
    const expected = structuredClone(original);
    const expectedLayer = selectedLayer(expected);
    for (const [shortcut, action] of sequence) {
      await page.keyboard.press(shortcut);
      await nextAnimationFrame(page);
      const stroke = action === 'undo' ? expectedLayer.strokes.pop() : expectedLayer.redo.pop();
      assert.ok(stroke, `${shortcut} should have a drawing-history entry`);
      if (action === 'undo') expectedLayer.redo.push(stroke);
      else expectedLayer.strokes.push(stroke);
    }

    await waitForHistoryButtons(page, true, true);
    assert.equal(await storedProjectText(page), JSON.stringify(original), 'rapid history changes should remain pending until page exit');
    assert.ok(await heldSaveCount(page));
    await page.reload();
    await assertReloadedProject(page, expected);
    await assertPhotoSettings(page, expected);
    await waitForHistoryButtons(page, true, true);
    assert.equal(selectedLayer(await storedProject(page)).strokes.length, 2);
    assert.equal(selectedLayer(await storedProject(page)).redo.length, 1);
    await context.close();
  } finally {
    await browser.close();
  }
});

async function launchShortcutTestBrowser() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
}

async function createHistoryPhotoProject(page, strokeCount) {
  await page.goto(url);
  const canvas = page.locator('canvas.draw-surface');
  await canvas.waitFor();
  await waitForStoredHistory(page, 0, 0);

  const pngData = await page.evaluate(() => {
    const photo = document.createElement('canvas');
    photo.width = 80;
    photo.height = 60;
    const context = photo.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable for the local photo fixture.');
    context.fillStyle = '#b8d5ea';
    context.fillRect(0, 0, photo.width, photo.height);
    return photo.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('input-photo').setInputFiles({
    name: 'undo-history-source.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngData, 'base64'),
  });
  await page.waitForFunction(() => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || 'null');
    return project?.title === 'undo-history-source' && project.image?.startsWith('data:image/png;base64,');
  });

  const opacity = page.getByTestId('input-reference-photo-opacity');
  await opacity.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < 37; step += 1) await page.keyboard.press('ArrowRight');
  await page.getByTestId('button-reference-photo-visibility').click();
  await page.waitForFunction(() => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || 'null');
    return project?.referencePhotoOpacity === 37 && project?.referencePhotoVisible === false;
  });

  for (let index = 0; index < strokeCount; index += 1) {
    await addDistinctSyntheticStroke(page, index);
    await waitForStoredHistory(page, index + 1, 0);
  }
  return canvas;
}

async function addDistinctSyntheticStroke(page, index) {
  const canvas = page.locator('canvas.draw-surface');
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  const startY = bounds.y + bounds.height * (0.18 + index * 0.25);
  const endY = startY + bounds.height * 0.04;
  await page.mouse.move(bounds.x + bounds.width * 0.2, startY);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, endY, { steps: 6 });
  await page.mouse.up();
}

async function focusDrawingSurface(canvas) {
  await canvas.evaluate(element => {
    element.tabIndex = 0;
    element.focus();
  });
  assert.equal(await canvas.evaluate(element => document.activeElement === element), true);
}

async function holdDebouncedProjectSaves(page) {
  await page.evaluate(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const held = new Set();
    let nextId = 0;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 500) {
        const id = 1_000_000_000 + ++nextId;
        held.add(id);
        return id;
      }
      return nativeSetTimeout(callback, delay, ...args);
    };
    window.clearTimeout = id => {
      if (held.delete(id)) return;
      nativeClearTimeout(id);
    };
    window.__heldProjectSaveCount = () => held.size;
  });
}

async function heldSaveCount(page) {
  return page.evaluate(() => window.__heldProjectSaveCount?.() ?? 0);
}

async function nextAnimationFrame(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
}

async function waitForHistoryButtons(page, undoEnabled, redoEnabled) {
  await page.waitForFunction(({ undoEnabled, redoEnabled }) => {
    const undo = document.querySelector('[data-testid="button-undo"]');
    const redo = document.querySelector('[data-testid="button-redo"]');
    return undo instanceof HTMLButtonElement
      && redo instanceof HTMLButtonElement
      && undo.disabled === !undoEnabled
      && redo.disabled === !redoEnabled;
  }, { undoEnabled, redoEnabled });
}

async function storedProject(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cloudpainter-project-v1') || 'null'));
}

async function storedProjectText(page) {
  return page.evaluate(() => localStorage.getItem('cloudpainter-project-v1'));
}

function selectedLayer(project) {
  const layer = project.layers.find(item => item.id === project.selectedLayerId);
  assert.ok(layer);
  return layer;
}

async function assertReloadedProject(page, expected) {
  await page.locator('canvas.draw-surface').waitFor();
  await page.waitForFunction(expectedProject => {
    return localStorage.getItem('cloudpainter-project-v1') === JSON.stringify(expectedProject);
  }, expected);
  assert.deepEqual(await storedProject(page), expected);
}

async function assertPhotoSettings(page, expected) {
  const project = await storedProject(page);
  assert.equal(project.image, expected.image);
  assert.equal(project.referencePhotoVisible, false);
  assert.equal(project.referencePhotoOpacity, 37);
  assert.equal(await page.getByTestId('button-reference-photo-visibility').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.getByTestId('input-reference-photo-opacity').inputValue(), '37');
}

async function storedHistory(page) {
  return page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
    const layer = project.layers?.find(item => item.id === project.selectedLayerId);
    return { strokes: layer?.strokes?.length ?? 0, redo: layer?.redo?.length ?? 0 };
  });
}

async function addSyntheticStroke(page) {
  const canvas = page.locator('canvas.draw-surface');
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.55, { steps: 6 });
  await page.mouse.up();
}

async function waitForStoredHistory(page, expectedStrokes, expectedRedo) {
  await page.waitForFunction(({ strokes, redo }) => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
    const layer = project.layers?.find(item => item.id === project.selectedLayerId);
    return layer?.strokes?.length === strokes && layer?.redo?.length === redo;
  }, { strokes: expectedStrokes, redo: expectedRedo });
}
