import { expect, test, type Page } from '@playwright/test';

const STORE_KEY = 'cloudpainter-project-v1';

async function savedProject(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), STORE_KEY);
}

async function markedPhoto(page: Page, width: number, height: number, name: string) {
  const data = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f6f3e9';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgb(30, 136, 229)';
    context.fillRect(0.47 * canvas.width - 12, 0.52 * canvas.height - 12, 24, 24);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height });
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

for (const photo of [
  { name: 'portrait', width: 400, height: 600 },
  { name: 'near-square', width: 500, height: 480 },
  { name: 'wide panorama (8:1)', width: 4800, height: 600 },
  { name: 'very tall portrait (1:8)', width: 600, height: 4800 },
]) {
  test(`photo and sketches stay aligned at every pan limit for a ${photo.name} photo`, async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('input-photo').setInputFiles(await markedPhoto(page, photo.width, photo.height, `pan-limits-${photo.name}.png`));
    await expect(page.getByTestId('img-reference')).toBeVisible();
    const stage = page.getByTestId('canvas-stage');
    const surface = page.locator('canvas.draw-surface');
    const fitBounds = await stage.boundingBox();
    expect(fitBounds).not.toBeNull();

    // Add a stroke to a distinct photo detail while the photo is fitted.
    const photoMarker = { x: 0.47, y: 0.52 };
    const marker = await page.evaluate(point => {
      const stage = document.querySelector('[data-testid="canvas-stage"]')!;
      const photo = document.querySelector('.base-photo') as HTMLImageElement;
      const scale = Math.min(stage.clientWidth / photo.naturalWidth, stage.clientHeight / photo.naturalHeight);
      const fittedWidth = photo.naturalWidth * scale;
      const fittedHeight = photo.naturalHeight * scale;
      return {
        x: ((stage.clientWidth - fittedWidth) / 2 + point.x * fittedWidth) / stage.clientWidth,
        y: ((stage.clientHeight - fittedHeight) / 2 + point.y * fittedHeight) / stage.clientHeight,
      };
    }, photoMarker);
    await page.mouse.click(
      fitBounds!.x + fitBounds!.width * marker.x,
      fitBounds!.y + fitBounds!.height * marker.y,
    );
    await expect.poll(async () => (await savedProject(page))?.layers[0]?.strokes.length).toBe(1);
    const fittedCanvas = await surface.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
    const originalStroke = (await savedProject(page)).layers[0].strokes[0];
    expect(originalStroke.points[0].x).toBeCloseTo(marker.x, 2);
    expect(originalStroke.points[0].y).toBeCloseTo(marker.y, 2);

    const zoom = page.getByTestId('input-photo-zoom');
    for (const zoomSteps of [2, 6, 12]) {
      await zoom.focus();
      for (let step = 0; step < zoomSteps; step++) await page.keyboard.press('ArrowRight');
      const zoomFactor = 1 + zoomSteps * 0.25;
      await expect(zoom).toHaveValue(String(zoomFactor * 100));
      await page.getByTestId('button-pan-mode').click();

      for (const { axis, direction } of [
      { axis: 'x' as const, direction: -1 },
      { axis: 'x' as const, direction: 1 },
      { axis: 'y' as const, direction: -1 },
      { axis: 'y' as const, direction: 1 },
      ]) {
      const dimensions = await stage.boundingBox();
      expect(dimensions).not.toBeNull();
      const limit = (axis === 'x' ? dimensions!.width : dimensions!.height) * (zoomFactor - 1) / 2;
      const target = direction * limit;
      const current = await photoPan(page);
      const distance = target - current[axis];
      const incrementLimit = (axis === 'x' ? dimensions!.width : dimensions!.height) * 0.5;
      const dragCount = Math.max(1, Math.ceil(Math.abs(distance) / incrementLimit));
      const increment = distance / dragCount;

      for (let drag = 0; drag < dragCount; drag++) {
        await panBy(page, axis === 'x' ? increment : 0, axis === 'y' ? increment : 0);
      }

      const pan = await photoPan(page);
      expect(pan[axis]).toBeCloseTo(target, 0);
      const view = await photoView(page);
      expect(view.stage).not.toBeNull();
      expect(view.content).not.toBeNull();
      // The transformed photo and canvas cover the clipped stage together;
      // no checkerboard gap can appear at a pan boundary.
      expect(view.content!.x).toBeLessThanOrEqual(view.stage!.x + 1);
      expect(view.content!.y).toBeLessThanOrEqual(view.stage!.y + 1);
      expect(view.content!.x + view.content!.width).toBeGreaterThanOrEqual(view.stage!.x + view.stage!.width - 1);
      expect(view.content!.y + view.content!.height).toBeGreaterThanOrEqual(view.stage!.y + view.stage!.height - 1);
      const alignedBounds = await page.evaluate(() => {
        const photo = document.querySelector('.base-photo')!.getBoundingClientRect();
        const canvas = document.querySelector('canvas.draw-surface')!.getBoundingClientRect();
        return {
          photo: [photo.left, photo.top, photo.width, photo.height],
          canvas: [canvas.left, canvas.top, canvas.width, canvas.height],
        };
      });
      expect(alignedBounds.canvas).toEqual(alignedBounds.photo);
      }

      await page.getByTestId('button-reset-photo-view').click();
      await expect(zoom).toHaveValue('100');
      await expect(page.getByTestId('button-pan-mode')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('button-reset-photo-view')).toBeDisabled();
      await expect.poll(() => photoPan(page)).toEqual({ x: 0, y: 0 });
      await expect.poll(() => surface.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).toBe(fittedCanvas);
    }

    const verification = await surface.evaluate((canvas, point) => {
      const element = canvas as HTMLCanvasElement;
      const context = element.getContext('2d')!;
      const x = Math.round(point.canvas.x * (element.width - 1));
      const y = Math.round(point.canvas.y * (element.height - 1));
      const photo = document.querySelector('.base-photo') as HTMLImageElement;
      const photoCanvas = document.createElement('canvas');
      photoCanvas.width = photo.naturalWidth;
      photoCanvas.height = photo.naturalHeight;
      const photoContext = photoCanvas.getContext('2d')!;
      photoContext.drawImage(photo, 0, 0);
      return {
        strokePixel: Array.from(context.getImageData(x, y, 1, 1).data),
        photoPixel: Array.from(photoContext.getImageData(
          Math.round(point.photo.x * (photoCanvas.width - 1)),
          Math.round(point.photo.y * (photoCanvas.height - 1)),
          1,
          1,
        ).data).slice(0, 3),
        strokes: JSON.parse(localStorage.getItem('cloudpainter-project-v1')!).layers[0].strokes,
      };
    }, { canvas: marker, photo: photoMarker });
    expect(verification.strokes).toEqual([originalStroke]);
    expect(verification.strokePixel[3]).toBeGreaterThan(0);
    expect(verification.photoPixel).toEqual([30, 136, 229]);
  });
}

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
  };
}

async function panBy(page: Page, deltaX: number, deltaY: number) {
  const stage = await page.getByTestId('canvas-stage').boundingBox();
  expect(stage).not.toBeNull();
  await page.mouse.move(stage!.x + stage!.width / 2, stage!.y + stage!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage!.x + stage!.width / 2 + deltaX, stage!.y + stage!.height / 2 + deltaY);
  await page.mouse.up();
}
