import { expect, test, type Page } from '@playwright/test';

const STORE_KEY = 'cloudpainter-project-v1';

const zoomPanTargets = [
  { zoomSteps: 2, panX: 38, panY: -24, x: 0.24, y: 0.32, photoColor: [229, 57, 53] },
  { zoomSteps: 6, panX: -54, panY: 31, x: 0.68, y: 0.43, photoColor: [67, 160, 71] },
  { zoomSteps: 11, panX: 72, panY: -42, x: 0.47, y: 0.52, photoColor: [30, 136, 229] },
];
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

async function markedPhoto(page: Page, name: string) {
  const data = await page.evaluate(markers => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f6f3e9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    markers.forEach(({ x, y, color }) => {
      context.fillStyle = color;
      context.fillRect(x * canvas.width - 12, y * canvas.height - 12, 24, 24);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, zoomPanTargets.map(({ x, y, photoColor }) => ({
    x, y, color: `rgb(${photoColor.join(', ')})`,
  })));
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
  const card = page.getByTestId('button-photo-card');
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

test('replacing a zoomed and panned landscape fits and centers the new portrait', async ({ page }) => {
  const landscape = await png(page, 'landscape.png', 600, 400);
  const portrait = await png(page, 'portrait.png', 300, 500);
  const chooser = page.waitForEvent('filechooser');
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
  await zoomAndPan(page);
  const replacement = page.waitForEvent('filechooser');
  await preview.click();
  await (await replacement).setFiles(portrait);
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
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(page.getByTestId('button-pan-mode')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('button-reset-photo-view')).toBeDisabled();
  await expect.poll(() => photoPan(page)).toEqual({ x: 0, y: 0 });
  // Check the rendered photo, not just controls: 100% means fitted to the stage.
  await expect.poll(async () => {
    const view = await photoView(page);
    return { stage: view.stage, content: view.content };
  }).toEqual({ stage, content: stage });
  await expect(page.getByTestId('input-photo')).toHaveAttribute('data-picker-clicks', '2');
});

test('cancelling replacement preserves zoom, pan, and saved photo, dimensions, title, and drawings', async ({ page }) => {
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
  await zoomAndPan(page);
  const before = await savedProject(page);
  const viewBefore = await photoView(page);
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
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('150');
  await expect(page.getByTestId('button-pan-mode')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-reset-photo-view')).toBeEnabled();
  expect(await photoView(page)).toEqual(viewBefore);
  // Reload verifies artwork persistence only; zoom and pan are session-only.
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

test('strokes stay on the same photo details across zoom and pan, and hidden layers allow photo dragging', async ({ page }) => {
  await page.getByTestId('input-photo').setInputFiles(await markedPhoto(page, 'zoom-alignment.png'));
  await expect(page.getByTestId('img-reference')).toBeVisible();
  const surface = page.locator('canvas.draw-surface');
  const layerId = await surface.getAttribute('data-testid').then(value => value!.replace('canvas-layer-', ''));
  const zoom = page.getByTestId('input-photo-zoom');

  for (const [index, marker] of zoomPanTargets.entries()) {
    await zoom.focus();
    for (let step = 0; step < marker.zoomSteps; step++) await page.keyboard.press('ArrowRight');
    await expect(zoom).toHaveValue(String(100 + marker.zoomSteps * 25));
    await page.getByTestId('button-pan-mode').click();
    await panBy(page, marker.panX, marker.panY);
    const offset = await photoPan(page);
    expect(offset.x).toBeCloseTo(marker.panX, 0);
    expect(offset.y).toBeCloseTo(marker.panY, 0);
    await page.getByTestId('button-pan-mode').click();

    const markerPosition = await page.evaluate(({ x, y }) => {
      const content = document.querySelector('.stage-content')!;
      const bounds = content.getBoundingClientRect();
      return { x: bounds.left + bounds.width * x, y: bounds.top + bounds.height * y };
    }, marker);
    await page.mouse.click(markerPosition.x, markerPosition.y);
    await expect.poll(async () => (await savedProject(page))?.layers[0]?.strokes.length).toBe(index + 1);

    await page.getByTestId('button-reset-photo-view').click();
    await expect(zoom).toHaveValue('100');
    const verification = await surface.evaluate((canvas, point) => {
      const element = canvas as HTMLCanvasElement;
      const context = element.getContext('2d')!;
      const x = Math.round(point.x * (element.width - 1));
      const y = Math.round(point.y * (element.height - 1));
      const photo = document.querySelector('.base-photo') as HTMLImageElement;
      const photoCanvas = document.createElement('canvas');
      photoCanvas.width = photo.naturalWidth;
      photoCanvas.height = photo.naturalHeight;
      const photoContext = photoCanvas.getContext('2d')!;
      photoContext.drawImage(photo, 0, 0);
      return {
        pixel: Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3),
        photoPixel: Array.from(photoContext.getImageData(
          Math.round(point.x * (photoCanvas.width - 1)),
          Math.round(point.y * (photoCanvas.height - 1)),
          1,
          1,
        ).data).slice(0, 3),
        strokes: JSON.parse(localStorage.getItem('cloudpainter-project-v1')!).layers[0].strokes,
      };
    }, { x: marker.x, y: marker.y });
    expect(verification.strokes[index].points[0].x).toBeCloseTo(marker.x, 2);
    expect(verification.strokes[index].points[0].y).toBeCloseTo(marker.y, 2);
    expect(verification.pixel).toEqual([49, 93, 77]);
    expect(verification.photoPixel).toEqual(marker.photoColor);
  }

  const savedBeforeHide = await savedProject(page);
  await page.getByTestId(`button-visibility-${layerId}`).click();
  await expect(page.getByTestId(`button-visibility-${layerId}`)).toHaveAttribute('aria-label', 'Show layer');
  await zoom.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(zoom).toHaveValue('150');
  await page.getByTestId('button-pan-mode').click();
  await panBy(page, 42, 26);
  const hiddenLayerPan = await photoPan(page);
  expect(hiddenLayerPan.x).toBeCloseTo(42, 0);
  expect(hiddenLayerPan.y).toBeCloseTo(26, 0);
  expect((await savedProject(page))?.layers[0]?.strokes).toEqual(savedBeforeHide.layers[0].strokes);
});

async function photoPan(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="canvas-stage"]')!;
    const content = stage.querySelector('.stage-content')!;
    const stageBounds = stage.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    return {
      x: contentBounds.left - (stageBounds.left + (stageBounds.width - contentBounds.width) / 2),
      y: contentBounds.top - (stageBounds.top + (stageBounds.height - contentBounds.height) / 2),
    };
  });
}

async function photoView(page: Page) {
  const stage = page.getByTestId('canvas-stage');
  return {
    stage: await stage.boundingBox(),
    content: await stage.locator('.stage-content').boundingBox(),
    transform: await stage.locator('.stage-content').evaluate(el => getComputedStyle(el).transform),
    pan: await photoPan(page),
  };
}

async function zoomAndPan(page: Page) {
  const zoom = page.getByTestId('input-photo-zoom');
  await zoom.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(zoom).toHaveValue('150');
  await page.getByTestId('button-pan-mode').click();
  await panBy(page, 42, -26);
  // Establish a non-default view so a premature reset cannot pass unnoticed.
  const pan = await photoPan(page);
  expect(pan.x).toBeCloseTo(42, 0);
  expect(pan.y).toBeCloseTo(-26, 0);
}

async function panBy(page: Page, deltaX: number, deltaY: number) {
  const stage = await page.getByTestId('canvas-stage').boundingBox();
  expect(stage).not.toBeNull();
  await page.mouse.move(stage!.x + stage!.width / 2, stage!.y + stage!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage!.x + stage!.width / 2 + deltaX, stage!.y + stage!.height / 2 + deltaY);
  await page.mouse.up();
}
