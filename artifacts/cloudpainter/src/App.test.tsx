import { expect, test, type Page } from '@playwright/test';

const STORE_KEY = 'cloudpainter-project-v1';

async function savedProject(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), STORE_KEY);
}

async function png(page: Page, name: string, width: number, height: number) {
  const data = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#87a6c0';
    context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height });
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

async function trackPicker(page: Page) {
  await page.getByTestId('input-photo').evaluate(input => {
    input.setAttribute('data-picker-clicks', '0');
    input.addEventListener('click', () => {
      input.setAttribute('data-picker-clicks', String(Number(input.getAttribute('data-picker-clicks')) + 1));
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('button-photo-card')).toBeVisible();
  await trackPicker(page);
});

test('the entire empty card opens the picker once, without a duplicate upload action', async ({ page }) => {
  const card = page.getByRole('button', { name: 'Import a reference photo', exact: true });
  await expect(page.getByTestId('button-upload')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upload photo', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('button-blank')).toBeVisible();
  await expect(page.getByTestId('input-photo')).toHaveAttribute('accept', 'image/*');
  const chooser = page.waitForEvent('filechooser');
  await card.click({ position: { x: 6, y: 6 } });
  await (await chooser).setFiles([]);
  await expect(page.getByTestId('input-photo')).toHaveAttribute('data-picker-clicks', '1');
});

for (const key of ['Enter', 'Space']) {
  test(`Tab focus and ${key} activate the card once with a visible focus outline`, async ({ page }) => {
    const card = page.getByTestId('button-photo-card');
    // Reach the control through the page's real tab order.
    for (let i = 0; i < 20 && !(await card.evaluate(el => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(card).toBeFocused();
    expect(await card.evaluate(el => ({
      visible: el.matches(':focus-visible'),
      style: getComputedStyle(el).outlineStyle,
      width: getComputedStyle(el).outlineWidth,
    }))).toEqual({ visible: true, style: 'solid', width: '3px' });
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press(key);
    await (await chooser).setFiles([]);
    await expect(page.getByTestId('input-photo')).toHaveAttribute('data-picker-clicks', '1');
  });
}

test('imports landscape and replaces it from the preview with a correctly proportioned portrait', async ({ page }) => {
  const landscape = await png(page, 'landscape.png', 600, 400);
  const portrait = await png(page, 'portrait.png', 300, 500);
  let chooser = page.waitForEvent('filechooser');
  await page.getByTestId('button-photo-card').click();
  await (await chooser).setFiles(landscape);
  const preview = page.getByTestId('img-reference');
  await expect(preview).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace reference photo', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const project = await savedProject(page);
    return project && { width: project.width, height: project.height, title: project.title };
  }).toEqual({ width: 600, height: 400, title: 'landscape' });

  // Include a layer before replacement to guard the existing import-reset behavior.
  await page.getByTestId('button-add-layer').click();
  chooser = page.waitForEvent('filechooser');
  await preview.click();
  await (await chooser).setFiles(portrait);
  await expect.poll(async () => {
    const project = await savedProject(page);
    return project && { width: project.width, height: project.height, title: project.title, layers: project.layers.length };
  }).toEqual({ width: 300, height: 500, title: 'portrait', layers: 1 });
  const dimensions = await preview.evaluate(image => {
    const img = image as HTMLImageElement;
    return { width: img.naturalWidth, height: img.naturalHeight, fit: getComputedStyle(img).objectFit };
  });
  expect(dimensions).toEqual({ width: 300, height: 500, fit: 'contain' });
  const stage = await page.getByTestId('canvas-stage').boundingBox();
  expect(stage).not.toBeNull();
  expect(stage!.width / stage!.height).toBeCloseTo(300 / 500, 2);
  await expect(page.getByTestId('input-photo')).toHaveAttribute('data-picker-clicks', '2');
});

test('cancelling the picker preserves the saved photo, dimensions, title, and drawings', async ({ page }) => {
  const photo = await png(page, 'keep-me.png', 320, 180);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('button-photo-card').click();
  await (await chooser).setFiles(photo);
  await expect(page.getByTestId('img-reference')).toBeVisible();
  await page.getByTestId('button-add-layer').click();
  const surface = page.locator('canvas.draw-surface');
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6);
  await page.mouse.up();
  await expect.poll(async () => {
    const project = await savedProject(page);
    return project?.layers[1]?.strokes.length;
  }).toBe(1);
  const before = await savedProject(page);
  const replacement = page.waitForEvent('filechooser');
  await page.getByTestId('img-reference').click();
  // Browsers do not expose the native dialog's Cancel button to automation.
  // An empty selection exercises handleFile's no-file branch; also send the
  // browser cancel event to confirm that it cannot mutate the project.
  await (await replacement).setFiles([]);
  await page.getByTestId('input-photo').dispatchEvent('cancel');
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
  await page.waitForTimeout(650); // Allow any accidental autosave to become visible.
  expect(await savedProject(page)).toEqual(before);
  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
  expect(await savedProject(page)).toEqual(before);
});

test('Remove photo is an independent control and never opens the picker', async ({ page }) => {
  const photo = await png(page, 'remove-me.png', 320, 180);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('button-photo-card').click();
  await (await chooser).setFiles(photo);
  const remove = page.getByRole('button', { name: 'Remove photo', exact: true });
  await expect(remove).toBeVisible();
  await expect.poll(async () => (await savedProject(page))?.title).toBe('remove-me');
  const before = await savedProject(page);
  expect(await remove.evaluate(el => el.parentElement?.closest('button'))).toBeNull();
  await remove.click();
  await expect(page.getByTestId('img-reference')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import a reference photo', exact: true })).toBeVisible();
  await expect(page.getByTestId('input-photo')).toHaveAttribute('data-picker-clicks', '1');
  await expect.poll(() => savedProject(page)).toEqual({ ...before, image: null });
});
