import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error('Set CLOUDPAINTER_TEST_URL to the existing preview.');
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Choose before or after.');
const output = new URL('../../../generated-artifacts/brush-controls/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  const measurements = [];
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(url);
    await page.getByTestId('input-color-hex').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const colors = page.locator('.drawing-colors');
    await colors.scrollIntoViewIfNeeded();
    measurements.push(await colors.evaluate((element, width) => {
      const bounds = element.getBoundingClientRect();
      const account = element.querySelector('.personal-palette, .palette-note');
      const accountTop = account?.getBoundingClientRect().top ?? bounds.bottom;
      return { width, panelWidth: bounds.width, guestHeight: accountTop - bounds.top,
        accountHeight: bounds.bottom - accountTop, totalHeight: bounds.height };
    }, width));
    await colors.screenshot({ path: new URL(`${phase}-${width}.png`, output).pathname });
  }
  await writeFile(new URL(`${phase}.json`, output), JSON.stringify(measurements, null, 2));
  console.log(JSON.stringify(measurements));
  if (phase === 'after') {
    const baseline = JSON.parse(await readFile(new URL('before.json', output), 'utf8'));
    const before = baseline.find(measurement => measurement.width === 1440);
    const after = measurements.find(measurement => measurement.width === 1440);
    assert.equal(before.panelWidth, after.panelWidth, 'Use the identical desktop sidebar width');
    assert.ok(after.guestHeight <= before.guestHeight * 0.75, 'Expanded guest controls are at least 25% shorter');
    console.log(`Expanded desktop guest reduction: ${((1 - after.guestHeight / before.guestHeight) * 100).toFixed(1)}%`);
  }
} finally {
  await browser.close();
}
