import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { logoConceptPngs } from './fixtures/logo-concept-pngs.mjs';

const appUrl = process.env.CLOUDPAINTER_TEST_URL;
if (!appUrl || !/^https?:\/\//.test(appUrl)) {
  throw new Error('Set CLOUDPAINTER_TEST_URL to the running CloudPainter preview URL.');
}

test('logo previews decode, download their matching PNGs, and clear after navigation', { timeout: 90_000 }, async () => {
  assert.equal(logoConceptPngs.length, 2);
  for (const fixture of logoConceptPngs) {
    assert.equal(fixture.buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(fixture.buffer.readUInt32BE(16), 1024);
    assert.equal(fixture.buffer.readUInt32BE(20), 1024);
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);

    const requests = [];
    await context.route('**/api/logo-images', async route => {
      const request = route.request();
      requests.push({
        method: request.method(),
        body: request.postDataJSON(),
      });
      const fixture = logoConceptPngs[requests.length - 1];
      assert.ok(fixture, 'Only the two expected local generation requests should be made.');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pngBase64: fixture.buffer.toString('base64'),
          width: 1024,
          height: 1024,
        }),
      });
    });

    const logoUrl = new URL('/logo-options', appUrl).toString();
    await page.goto(logoUrl);

    for (let index = 0; index < logoConceptPngs.length; index++) {
      const conceptId = index + 1;
      await page.getByTestId('input-logo-prompt').fill(`Distinct local test concept ${conceptId}`);
      await page.getByTestId('select-logo-direction').selectOption(index === 0 ? 'cloudline' : 'sunstudy');
      await page.getByTestId('button-generate-logo').click();
      const image = page.getByTestId(`img-logo-result-${conceptId}`);
      await image.waitFor({ state: 'visible' });
      await page.waitForFunction(id => {
        const element = document.querySelector(`[data-testid="img-logo-result-${id}"]`);
        return element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0;
      }, conceptId);

      const decoded = await image.evaluate((element, expectedPixel) => {
        const img = element;
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        return {
          width: img.naturalWidth,
          height: img.naturalHeight,
          center: [...context.getImageData(512, 512, 1, 1).data],
          alt: img.alt,
        };
      }, logoConceptPngs[index].centerPixel);
      assert.deepEqual(
        { width: decoded.width, height: decoded.height, center: decoded.center },
        { width: 1024, height: 1024, center: logoConceptPngs[index].centerPixel },
        `Concept ${conceptId} must render as the matching decodable PNG.`,
      );
      assert.equal(decoded.alt, `Generated logo concept ${conceptId}`);
    }

    assert.equal(await page.getByTestId('logo-concept-gallery').getByRole('listitem').count(), 2);
    const desktopCards = await page.locator('.logo-concept-card').evaluateAll(cards =>
      cards.map(card => {
        const { x, y, width, height } = card.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    assert.equal(desktopCards.length, 2);
    assert.notEqual(desktopCards[0].x, desktopCards[1].x, 'Desktop concepts should occupy separate columns.');
    assert.ok(Math.abs(desktopCards[0].y - desktopCards[1].y) < 2, 'Desktop concepts should share a row.');

    const outputDir = await mkdtemp(join(tmpdir(), 'cloudpainter-logo-previews-'));
    try {
      for (let index = 0; index < logoConceptPngs.length; index++) {
        const conceptId = index + 1;
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByTestId(`button-download-logo-${conceptId}`).click(),
        ]);
        assert.equal(download.suggestedFilename(), `cloudpainter-logo-concept-${conceptId}.png`);
        const downloadedPath = join(outputDir, download.suggestedFilename());
        await download.saveAs(downloadedPath);
        assert.deepEqual(
          await readFile(downloadedPath),
          logoConceptPngs[index].buffer,
          `Concept ${conceptId} download must contain the PNG displayed in its preview.`,
        );
      }
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }

    await page.setViewportSize({ width: 360, height: 800 });
    const mobileLayout = await page.locator('.logo-concept-card').evaluateAll(cards =>
      cards.map(card => {
        const { x, y, width, height } = card.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    assert.equal(mobileLayout.length, 2);
    assert.ok(mobileLayout[1].y >= mobileLayout[0].y + mobileLayout[0].height, 'Narrow-phone concepts should stack vertically.');
    assert.ok(mobileLayout.every(card => card.x >= 0 && card.x + card.width <= 360), 'Each mobile card must fit the viewport.');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      'The narrow-phone logo page must not scroll horizontally.',
    );

    await page.getByTestId('link-return-workspace').click();
    await page.waitForURL(url => url.pathname === '/');
    await page.getByTestId('link-logo-options').click();
    await page.waitForURL(url => url.pathname === '/logo-options');
    assert.equal(await page.getByTestId('logo-concept-gallery').getByRole('listitem').count(), 0);
    assert.equal(await page.locator('.logo-concept-gallery img').count(), 0);
    assert.equal(requests.length, 2, 'Navigation must not issue another generation request.');

    await context.close();
  } finally {
    await browser.close();
  }
});
