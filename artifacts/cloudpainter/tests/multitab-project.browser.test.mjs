import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error('Set CLOUDPAINTER_TEST_URL to the running preview.');

const STORE_KEY = 'cloudpainter-project-v1';
const HISTORY_KEY = 'cloudpainter-project-history-v1';
const seed = {
  image: null,
  width: 1200,
  height: 800,
  layers: [{ id: 'baseline-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  selectedLayerId: 'baseline-layer',
  title: 'Two-tab check',
  photoZoom: 1,
  photoPan: { x: 0, y: 0 },
  referencePhotoVisible: true,
  referencePhotoOpacity: 100,
};

async function waitForStoredLayerCount(page, count) {
  await page.waitForFunction(({ key, count }) => {
    const project = JSON.parse(localStorage.getItem(key) ?? 'null');
    return project?.layers?.length === count;
  }, { key: STORE_KEY, count });
}

async function layerIds(page) {
  return page.locator('[data-testid^="button-rename-"]').evaluateAll(buttons =>
    buttons.map(button => button.getAttribute('data-testid').replace('button-rename-', '')),
  );
}

async function addLayerAndStroke(page) {
  await page.getByTestId('button-add-layer').click();
  const canvas = page.locator('canvas.draw-surface');
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  const startX = bounds.x + bounds.width * 0.35;
  const startY = bounds.y + bounds.height * 0.35;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + bounds.width * 0.18, startY + bounds.height * 0.12, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(key => {
    const project = JSON.parse(localStorage.getItem(key) ?? 'null');
    return project?.layers?.some(layer => layer.id !== 'baseline-layer' && layer.strokes.length > 0);
  }, STORE_KEY);
}

async function openTwoTabs(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ key, project }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(project));
  }, { key: STORE_KEY, project: seed });
  const first = await context.newPage();
  const second = await context.newPage();
  for (const page of [first, second]) {
    page.setDefaultTimeout(10_000);
    await page.goto(url);
    await page.getByTestId('button-add-layer').waitFor();
    await page.getByTestId('status-save').waitFor();
  }
  await waitForStoredLayerCount(first, 1);
  return { context, first, second };
}

async function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
}

for (const winnerIndex of [0, 1]) {
  test(`a stale autosave and pagehide cannot replace the newer sketch (tab ${winnerIndex + 1} saves first)`, { timeout: 60_000 }, async () => {
    const browser = await launchBrowser();
    try {
      const { context, first, second } = await openTwoTabs(browser);
      const tabs = [first, second];
      const winner = tabs[winnerIndex];
      const stale = tabs[1 - winnerIndex];

      await addLayerAndStroke(winner);
      const winningSnapshot = await winner.evaluate(key => localStorage.getItem(key), STORE_KEY);
      const winningIds = await layerIds(winner);

      await addLayerAndStroke(stale);
      await stale.getByTestId('storage-conflict').waitFor();
      const staleIds = await layerIds(stale);
      assert.equal(staleIds.length, 2);
      const staleLayerId = staleIds.find(id => id !== 'baseline-layer');
      const winningLayerId = winningIds.find(id => id !== 'baseline-layer');
      assert.ok(staleLayerId && winningLayerId);
      assert.notEqual(staleLayerId, winningLayerId, 'the stale tab created its own unsaved layer');
      assert.equal(await stale.evaluate(key => localStorage.getItem(key), STORE_KEY), winningSnapshot);

      // Reload invokes pagehide in the outgoing stale document before loading
      // the winning snapshot in the new document.
      await stale.reload();
      await stale.getByTestId('button-add-layer').waitFor();
      assert.equal(await stale.evaluate(key => localStorage.getItem(key), STORE_KEY), winningSnapshot);
      assert.deepEqual(await layerIds(stale), winningIds);
      await context.close();
    } finally {
      await browser.close();
    }
  });
}

test('Reload newer sketch switches the stale tab without writing its local version', { timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, first, second } = await openTwoTabs(browser);
    await addLayerAndStroke(first);
    const winningSnapshot = await first.evaluate(key => localStorage.getItem(key), STORE_KEY);
    const winningIds = await layerIds(first);
    await addLayerAndStroke(second);
    await second.getByTestId('storage-conflict').waitFor();
    await second.getByTestId('button-conflict-reload').click();
    await second.getByTestId('storage-conflict').waitFor({ state: 'detached' });
    assert.equal(await second.evaluate(key => localStorage.getItem(key), STORE_KEY), winningSnapshot);
    assert.deepEqual(await layerIds(second), winningIds);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('a stale version can be kept in Saved sketches without replacing the shared sketch', { timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, first, second } = await openTwoTabs(browser);
    await addLayerAndStroke(first);
    const winningSnapshot = await first.evaluate(key => localStorage.getItem(key), STORE_KEY);

    await addLayerAndStroke(second);
    await second.getByTestId('storage-conflict').waitFor();
    const separateLayerId = (await layerIds(second))[1];
    await second.getByTestId('button-conflict-preserve').click();
    await second.getByTestId('storage-conflict').waitFor({ state: 'detached' });
    await second.getByTestId('status-toast').waitFor();

    assert.equal(await second.evaluate(key => localStorage.getItem(key), STORE_KEY), winningSnapshot);
    const history = await second.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), HISTORY_KEY);
    const separateVersion = history.find(project => project.layers.some(layer => layer.id === separateLayerId));
    assert.ok(separateVersion);
    assert.equal(separateVersion.title, 'Two-tab check (your version)');
    await context.close();
  } finally {
    await browser.close();
  }
});
