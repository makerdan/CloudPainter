import { expect, test, type Page } from '@playwright/test';

const STORE_KEY = 'cloudpainter-project-v1';
const models = ['Nano-Banana-Pro', 'Nano-Banana-2', 'GPT-Image-2.5-Sunburst', 'Flux-2-Turbo'];
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), STORE_KEY);

test.beforeEach(async ({ page }) => {
  await page.route('**/api/images/config', route => route.fulfill({ json: { configured: true } }));
  await page.goto('./');
  await page.getByTestId('button-add-layer').click();
  await expect.poll(async () => (await saved(page))?.layers.length).toBe(2);
});

test('Poe picker offers exactly four models and preview requires explicit use', async ({ page }) => {
  const before = await saved(page);
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 320;
    canvas.getContext('2d')!.fillRect(0, 0, 640, 320);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  let body: unknown;
  await page.route('**/api/images/generate', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { b64_json: base64, mime: 'image/png' } });
  });
  await page.getByTestId('button-generate-image').click();
  await expect(page.locator('#image-model option')).toHaveText(models);
  await expect(page.getByTestId('button-submit-generation')).toBeDisabled();
  await page.getByTestId('input-image-prompt').fill('Clouds over a blue sky');
  await page.getByTestId('select-image-model').selectOption('Flux-2-Turbo');
  await page.getByRole('dialog').screenshot({ path: '../../generated-artifacts/cloudpainter-poe-dialog.png' });
  await page.getByTestId('button-submit-generation').click();
  await expect(page.getByTestId('generated-image-preview')).toBeVisible();
  expect(body).toEqual({ prompt: 'Clouds over a blue sky', model: 'Flux-2-Turbo' });
  expect(await saved(page)).toEqual(before);
  await page.getByTestId('button-use-generated-image').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => {
    const project = await saved(page);
    return { width: project.width, height: project.height, layers: project.layers.length };
  }).toEqual({ width: 640, height: 320, layers: 1 });
  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', `data:image/png;base64,${base64}`);
});

test('Poe failures preserve the sketch and never issue an alternate-model request', async ({ page }) => {
  const before = await saved(page);
  let requests = 0;
  await page.route('**/api/images/generate', route => {
    requests++;
    return route.fulfill({ status: 503, json: { code: 'model_unavailable', error: 'The selected model is unavailable through Poe. No replacement model was used.' } });
  });
  await page.getByTestId('button-generate-image').click();
  await page.getByTestId('input-image-prompt').fill('Clouds over a blue sky');
  await page.getByTestId('button-submit-generation').click();
  await expect(page.getByTestId('generation-error')).toContainText('No replacement model was used');
  await expect(page.getByTestId('button-use-generated-image')).toHaveCount(0);
  expect(requests).toBe(1);
  expect(await saved(page)).toEqual(before);
});

test('missing Poe configuration disables generation without touching the sketch', async ({ page }) => {
  const before = await saved(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/images/config', route => route.fulfill({ json: { configured: false } }));
  await page.getByTestId('button-generate-image').click();
  await page.getByTestId('input-image-prompt').fill('Clouds over a blue sky');
  await expect(page.getByRole('status').filter({ hasText: 'Poe is not configured' })).toBeVisible();
  await expect(page.getByTestId('button-submit-generation')).toBeDisabled();
  await page.getByRole('dialog').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../../generated-artifacts/cloudpainter-poe-mobile.png' });
  expect(await saved(page)).toEqual(before);
});
