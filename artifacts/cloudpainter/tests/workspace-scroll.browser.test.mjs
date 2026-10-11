import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) {
  throw new Error('Set CLOUDPAINTER_TEST_URL to the running CloudPainter preview.');
}

function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
}

async function openIsolatedPage(browser, viewport, savedSketch = null) {
  const context = await browser.newContext({ viewport });
  if (savedSketch) {
    await context.addInitScript(project => {
      localStorage.setItem('cloudpainter-project-history-v1', JSON.stringify([project]));
    }, savedSketch);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(url);
  await page.getByTestId('status-save').waitFor();
  return { context, page };
}

async function assertNoHorizontalOverflow(page, viewportWidth) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.ok(widths.document <= viewportWidth, `Document overflows horizontally: ${JSON.stringify(widths)}`);
  assert.ok(widths.body <= viewportWidth, `Body overflows horizontally: ${JSON.stringify(widths)}`);
}

test('workspace bottom spacing and controls remain reachable across responsive sizes', { timeout: 90_000 }, async () => {
  const browser = await launchBrowser();
  const viewportSizes = [
    { width: 390, height: 667 },
    { width: 719, height: 800 },
    { width: 720, height: 800 },
    { width: 721, height: 800 },
    { width: 768, height: 1024 },
    { width: 1119, height: 900 },
    { width: 1120, height: 900 },
    { width: 1121, height: 900 },
    { width: 1440, height: 900 },
  ];
  try {
    const { context, page } = await openIsolatedPage(browser, viewportSizes[0]);
    try {
      for (const [index, viewport] of viewportSizes.entries()) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => window.scrollTo(0, 0));
        await assertNoHorizontalOverflow(page, viewport.width);

        const spacing = await page.locator('.workspace').evaluate(element => ({
          paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
          viewportHeight: window.innerHeight,
        }));
        assert.ok(
          Math.abs(spacing.paddingBottom - spacing.viewportHeight / 2) <= 1,
          `${viewport.width}px workspace should retain half a viewport of bottom space: ${JSON.stringify(spacing)}`,
        );
        const shellPadding = await page.locator('.app-shell').evaluate(element => {
          const style = getComputedStyle(element);
          return {
            left: Number.parseFloat(style.paddingLeft),
            right: Number.parseFloat(style.paddingRight),
          };
        });
        const expectedShellPadding = viewport.width <= 720 ? 13 : 28;
        assert.equal(shellPadding.left, expectedShellPadding, `${viewport.width}px left shell margin`);
        assert.equal(shellPadding.right, expectedShellPadding, `${viewport.width}px right shell margin`);

        const addLayer = page.getByTestId('button-add-layer');
        await addLayer.scrollIntoViewIfNeeded();
        const addLayerBounds = await addLayer.boundingBox();
        assert.ok(addLayerBounds, `${viewport.width}px Add a drawing layer control should be rendered`);
        assert.ok(addLayerBounds.y >= 0 && addLayerBounds.y + addLayerBounds.height <= viewport.height);
        if (index === 0) {
          await addLayer.click();
          assert.equal(await page.locator('.layer-row').count(), 2, 'The reachable layer action should work');
        }

        const pasteDrawing = page.getByTestId('button-paste-drawing');
        await pasteDrawing.scrollIntoViewIfNeeded();
        const pasteBounds = await pasteDrawing.boundingBox();
        assert.ok(pasteBounds, `${viewport.width}px Paste drawing action should be rendered`);
        assert.ok(pasteBounds.y >= 0 && pasteBounds.y + pasteBounds.height <= viewport.height);

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const lastAction = page.getByTestId('disclosure-reminder');
        const endState = await lastAction.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const workspace = document.querySelector('.workspace');
          return {
            top: bounds.top,
            bottom: bounds.bottom,
            height: window.innerHeight,
            scrollY: window.scrollY,
            maxScroll: document.documentElement.scrollHeight - window.innerHeight,
            workspacePaddingBottom: Number.parseFloat(getComputedStyle(workspace).paddingBottom),
          };
        });
        assert.ok(endState.maxScroll > 0, `${viewport.width}px workspace should have a reachable page end`);
        assert.ok(
          endState.top >= endState.height * 0.2 && endState.bottom <= endState.height * 0.8,
          `${viewport.width}px final workspace action should sit above the bottom spacer: ${JSON.stringify(endState)}`,
        );
        assert.ok(Math.abs(endState.scrollY - endState.maxScroll) <= 1, 'The page should reach its actual scroll end');
        assert.ok(Math.abs(endState.workspacePaddingBottom - viewport.height / 2) <= 1);
        if (await lastAction.getAttribute('aria-expanded') !== 'true') await lastAction.click();
        assert.equal(await lastAction.getAttribute('aria-expanded'), 'true', 'The final workspace action should operate');
        await assertNoHorizontalOverflow(page, viewport.width);
      }

      for (const height of [720, 600]) {
        const viewport = { width: 390, height };
        await page.setViewportSize(viewport);
        const paddingBottom = await page.locator('.workspace').evaluate(element =>
          Number.parseFloat(getComputedStyle(element).paddingBottom),
        );
        assert.ok(Math.abs(paddingBottom - height / 2) <= 1, `${height}px height should update bottom spacing`);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const lastActionBounds = await page.getByTestId('disclosure-reminder').boundingBox();
        assert.ok(lastActionBounds);
        assert.ok(lastActionBounds.y >= 0 && lastActionBounds.y + lastActionBounds.height <= height);
        await assertNoHorizontalOverflow(page, viewport.width);
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('short and long status messages remain visible and dismissible while scrolling', { timeout: 90_000 }, async () => {
  const browser = await launchBrowser();
  const longTitle = `Saved sketch ${'with a deliberately long name '.repeat(16)}`;
  const savedSketch = {
    image: null,
    width: 1200,
    height: 800,
    layers: [{ id: 'scroll-fixture-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
    selectedLayerId: 'scroll-fixture-layer',
    title: longTitle,
    photoZoom: 1,
    photoPan: { x: 0, y: 0 },
    referencePhotoVisible: true,
    referencePhotoOpacity: 100,
  };
  const viewportSizes = [
    { width: 390, height: 667 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];
  try {
    for (const viewport of viewportSizes) {
      const { context, page } = await openIsolatedPage(browser, viewport, savedSketch);
      try {
        await page.getByTestId('button-blank').click();
        const shortToast = page.getByTestId('status-toast');
        await shortToast.waitFor({ state: 'visible' });
        assert.match(await shortToast.innerText(), /A fresh transparent canvas is ready/);
        await assertToastFitsViewport(shortToast, page, viewport);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await assertToastFitsViewport(shortToast, page, viewport);
        await shortToast.getByRole('button', { name: 'Dismiss message' }).click();
        await shortToast.waitFor({ state: 'hidden' });

        await page.getByTestId('button-restore-project-0').click();
        const longToast = page.getByTestId('status-toast');
        await longToast.waitFor({ state: 'visible' });
        assert.ok((await longToast.innerText()).includes(longTitle));
        await assertToastFitsViewport(longToast, page, viewport);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await assertToastFitsViewport(longToast, page, viewport);
        const dismissButton = longToast.getByRole('button', { name: 'Dismiss message' });
        await dismissButton.focus();
        assert.equal(await dismissButton.evaluate(element => document.activeElement === element), true);
        await dismissButton.press('Enter');
        await longToast.waitFor({ state: 'hidden' });
        await assertNoHorizontalOverflow(page, viewport.width);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

async function assertToastFitsViewport(toast, page, viewport) {
  const layout = await toast.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      text: element.querySelector('span')?.textContent ?? '',
      textBounds: (() => {
        const text = element.querySelector('span');
        if (!text) return null;
        const range = document.createRange();
        range.selectNodeContents(text);
        const bounds = range.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      })(),
      dismiss: (() => {
        const button = element.querySelector('button');
        const buttonBounds = button?.getBoundingClientRect();
        return buttonBounds ? {
          left: buttonBounds.left,
          right: buttonBounds.right,
          top: buttonBounds.top,
          bottom: buttonBounds.bottom,
        } : null;
      })(),
    };
  });
  assert.equal(layout.position, 'fixed', 'Messages should stay anchored to the viewport');
  assert.ok(layout.left >= 0 && layout.right <= viewport.width, `Message exceeds viewport width: ${JSON.stringify(layout)}`);
  assert.ok(layout.top >= 0 && layout.bottom <= viewport.height, `Message exceeds viewport height: ${JSON.stringify(layout)}`);
  assert.ok(
    Math.abs((layout.left + layout.right) / 2 - layout.viewportWidth / 2) <= 1,
    `Message should remain centered in the viewport: ${JSON.stringify(layout)}`,
  );
  assert.ok(
    Math.abs(layout.viewportHeight - layout.bottom - 22) <= 1,
    `Message should retain its bottom offset: ${JSON.stringify(layout)}`,
  );
  assert.ok(layout.dismiss, 'A visible dismiss action should be available');
  assert.ok(layout.textBounds, 'Message text should have visible bounds');
  assert.ok(
    layout.textBounds.left >= layout.left && layout.textBounds.right <= layout.right
      && layout.textBounds.top >= layout.top && layout.textBounds.bottom <= layout.bottom,
    `Message text should remain inside the visible status message: ${JSON.stringify(layout)}`,
  );
  assert.ok(
    layout.dismiss.left >= layout.left && layout.dismiss.right <= layout.right
      && layout.dismiss.top >= layout.top && layout.dismiss.bottom <= layout.bottom,
    `Dismiss action should remain inside the message: ${JSON.stringify(layout)}`,
  );
  assert.ok(layout.text.length > 0);
  await assertNoHorizontalOverflow(page, viewport.width);
}
