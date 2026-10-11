import { expect, test, type Locator, type Page } from '@playwright/test';

const STORE_KEY = 'cloudpainter-project-v1';

async function trigger(button: Locator) {
  return await button.isDisabled() ? button.locator('..') : button;
}

async function focusAgain(page: Page, button: Locator) {
  // Radix dismisses on click; an already-focused button needs a new focus event.
  await page.mouse.move(0, 0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const target = await trigger(button);
   await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await target.focus();
}

async function checkTooltip(page: Page, button: Locator, keyboard = false) {
  const target = await trigger(button);
  if (keyboard) await focusAgain(page, button);
  else await target.hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  expect((await tip.innerText()).length).toBeGreaterThan(20);
  const rect = await page.locator('.action-tooltip').boundingBox();
  const viewport = page.viewportSize()!;
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  expect(await button.getAttribute('title')).toBeNull();
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);
}

test('every workspace button explains its action by hover and focus, including disabled states', async ({ page }) => {
  await page.goto('./');
  for (const id of ['color', 'size', 'opacity', 'reminder']) {
    const header = page.getByTestId(`disclosure-${id}`);
    if (await header.getAttribute('aria-expanded') === 'false') await header.click();
  }
  const buttons = page.locator('main button');
  expect(await buttons.count()).toBeGreaterThan(15);
  for (const button of await buttons.all()) {
    await checkTooltip(page, button);
    await checkTooltip(page, button, true);
  }
  await checkTooltip(page, page.getByTestId('link-logo-options'));

  // Disabled explanation wrappers are focusable, but Enter/Space cannot edit the project.
  const undo = page.getByTestId('button-undo');
  const before = await page.evaluate(key => localStorage.getItem(key), STORE_KEY);
  await (await trigger(undo)).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(undo).toBeDisabled();
  expect(await page.evaluate(key => localStorage.getItem(key), STORE_KEY)).toBe(before);

  // Enabled keyboard activation and state-dependent visibility descriptions.
  await page.getByTestId('button-add-layer').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.layer-row')).toHaveCount(2);
  const visibility = page.locator('[data-testid^="button-visibility-"]').first();
  await visibility.click();
  await focusAgain(page, visibility);
  await expect(page.getByRole('tooltip')).toContainText('include it in PNG exports');
  await page.keyboard.press('Escape');
  await visibility.click();
  await focusAgain(page, visibility);
  await expect(page.getByRole('tooltip')).toContainText('without deleting its drawings');
  await page.keyboard.press('Escape');

  // Color buttons retain their drawing-tool behavior.
  await page.getByTestId('button-tool-eraser').click();
  const swatch = page.getByTestId('button-color-2');
  await swatch.hover();
  await expect(page.getByRole('tooltip')).toContainText('return to your last drawing instrument');
  await swatch.click();
  await expect(page.getByTestId('button-tool-brush')).toHaveClass(/selected/);
  await focusAgain(page, swatch);
  await expect(page.getByRole('tooltip')).toContainText('Current drawing color');
  await page.keyboard.press('Escape');

  // Check both ends of layer ordering after a second layer exists.
  for (const button of await page.locator('[data-testid^="button-layer-"]').all()) {
    await checkTooltip(page, button, true);
  }
  const canvas = page.locator('canvas.draw-surface');
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6);
  await page.mouse.up();
  await expect(undo).toBeEnabled();
  await focusAgain(page, undo);
  await expect(page.getByRole('tooltip')).toContainText('most recent drawing or erasing stroke');
  await page.keyboard.press('Enter');
  const redo = page.getByTestId('button-redo');
  await expect(redo).toBeEnabled();
  await focusAgain(page, redo);
  await expect(page.getByRole('tooltip')).toContainText('Restore the last undone stroke');
  await page.keyboard.press('Enter');
  await expect(undo).toBeEnabled();
});

test('photo controls explain zoom limits and mode changes without panel clipping', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('disclosure-size').click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('input-photo').setInputFiles({
    name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64'),
  });
  for (const name of ['button-remove-photo', 'button-zoom-out', 'button-zoom-in', 'button-pan-mode', 'button-reset-photo-view']) {
    const button = page.getByTestId(name);
    await checkTooltip(page, button);
    await checkTooltip(page, button, true);
  }
  await page.getByTestId('button-zoom-in').click();
  const pan = page.getByTestId('button-pan-mode');
  await expect(pan).toBeEnabled();
  await pan.click();
  await expect(pan).toHaveAttribute('aria-pressed', 'true');
  await focusAgain(page, pan);
  await expect(page.getByRole('tooltip')).toContainText('return to drawing');
  await page.keyboard.press('Escape');
  await page.getByTestId('input-photo-zoom').fill('400');
  await expect(page.getByTestId('button-zoom-in')).toBeDisabled();
  await focusAgain(page, page.getByTestId('button-zoom-in'));
  await expect(page.getByRole('tooltip')).toContainText('maximum zoom of 400%');
});

test('touch taps perform actions without leaving hover tooltips over controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto(process.env.CLOUDPAINTER_TEST_URL!);
    await page.getByTestId('button-add-layer').tap();
    await expect(page.locator('.layer-row')).toHaveCount(2);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByTestId('button-tool-eraser').tap();
    await expect(page.getByTestId('button-tool-eraser')).toHaveClass(/selected/);
    await page.getByTestId('button-color-2').tap();
    await expect(page.getByTestId('button-tool-brush')).toHaveClass(/selected/);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('brush disclosures and all expanded color controls explain their actions', async ({ page }) => {
  await page.goto('./');
  for (const id of ['color', 'size', 'opacity', 'reminder']) {
    const header = page.getByTestId(`disclosure-${id}`);
    await checkTooltip(page, header);
    await checkTooltip(page, header, true);
    if (await header.getAttribute('aria-expanded') === 'false') await header.click();
  }
  for (const button of await page.locator('.right-panel button').all()) {
    await checkTooltip(page, button);
    await checkTooltip(page, button, true);
  }
  for (const id of ['input-color-custom', 'input-color-hex']) {
    const input = page.getByTestId(id);
    await checkTooltip(page, input);
    await checkTooltip(page, input, true);
  }
});
