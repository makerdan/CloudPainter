import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';

const appDirectory = new URL('../', import.meta.url);
let serverProcess;
let browser;
let appUrl;
let serverOutput = '';

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForApp(url) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`CloudPainter did not start at ${url}.\n${serverOutput}\n${lastError ?? ''}`);
}

async function openExportMenu(page) {
  const trigger = page.getByTestId('button-export-menu');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

async function exportControl(page, testId) {
  await openExportMenu(page);
  return page.getByTestId(testId);
}

async function clickExportAction(page, testId) {
  await openExportMenu(page);
  await page.getByTestId(testId).click();
}

async function dispatchTouchPointers(page, events) {
  await page.evaluate(async events => {
    const surface = document.querySelector('canvas.draw-surface');
    if (!(surface instanceof HTMLCanvasElement)) throw new Error('The drawing surface is not available.');
    // Synthetic PointerEvents let the browser test control simultaneous pointers exactly.
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
    const activePointers = new Set();
    for (const { type, pointerId, x, y } of events) {
      if (type === 'pointerdown') activePointers.add(pointerId);
      surface.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        isPrimary: activePointers.size === 1,
        button: 0,
        buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
        clientX: x,
        clientY: y,
      }));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      if (type === 'pointerup' || type === 'pointercancel') activePointers.delete(pointerId);
    }
  }, events);
}

async function savedDrawing(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null'));
}

async function touchControl(page, locator) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds, 'the mobile control should have a visible hit area');
  try {
    await locator.tap({ timeout: 1_500 });
  } catch (error) {
    throw new Error(`The mobile photo control was not touch-actionable: ${error.message}`);
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function waitForZoom(page, value) {
  await page.waitForFunction(expected => {
    const input = document.querySelector('[data-testid="input-photo-zoom"]');
    return input instanceof HTMLInputElement && input.value === expected;
  }, String(value), { timeout: 2_000 });
}

async function traceControlTouch(page, locator) {
  await locator.evaluate(button => {
    window.__photoControlTouchTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
      button.addEventListener(type, event => {
        window.__photoControlTouchTrace.push({
          type,
          defaultPrevented: event.defaultPrevented,
          disabled: button.disabled,
        });
      }, { capture: true });
    }
  });
}

before(async () => {
  const port = await findAvailablePort();
  appUrl = `http://127.0.0.1:${port}/`;
  serverProcess = spawn('pnpm', ['run', 'dev'], {
    cwd: new URL('.', appDirectory),
    env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  serverProcess.stdout.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
  await waitForApp(appUrl);

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
});

after(async () => {
  await browser?.close();
  if (serverProcess?.pid) {
    try {
      process.kill(process.platform === 'win32' ? serverProcess.pid : -serverProcess.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
});

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, received ${actual}`);
}

async function renderPdfWithPoppler(pdfBytes, page, artwork = null) {
  const directory = await mkdtemp(join(tmpdir(), 'cloudpainter-pdf-render-'));
  const pdfPath = join(directory, 'export.pdf');
  const imagePrefix = join(directory, 'rendered-page');
  try {
    await writeFile(pdfPath, pdfBytes);
    execFileSync('pdftoppm', [
      '-f', '1',
      '-l', '1',
      '-singlefile',
      '-r', String(artwork?.renderDpi ?? 144),
      '-png',
      pdfPath,
      imagePrefix,
    ]);
    const png = await readFile(`${imagePrefix}.png`);
    return page.evaluate(async ({ pngBase64, artwork }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${pngBase64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not inspect the PDF renderer output.');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const bounds = { minX: canvas.width, minY: canvas.height, maxX: -1, maxY: -1 };
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (data[offset] < 240 || data[offset + 1] < 240 || data[offset + 2] < 240) {
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
          }
        }
      }
      if (bounds.maxX < 0 || bounds.maxY < 0) throw new Error('The PDF renderer produced a blank page.');
      const sample = (xRatio, yRatio) => {
        if (artwork) {
          const scale = Math.min(
            (artwork.pageWidthPoints - artwork.safeMarginPoints * 2) / artwork.width,
            (artwork.pageHeightPoints - artwork.safeMarginPoints * 2) / artwork.height,
          );
          const artworkWidthPoints = artwork.width * scale;
          const artworkHeightPoints = artwork.height * scale;
          const leftPoints = (artwork.pageWidthPoints - artworkWidthPoints) / 2;
          const topPoints = (artwork.pageHeightPoints - artworkHeightPoints) / 2;
          const x = Math.floor(
            (leftPoints + xRatio * artworkWidthPoints) * canvas.width / artwork.pageWidthPoints,
          );
          const y = Math.floor(
            (topPoints + yRatio * artworkHeightPoints) * canvas.height / artwork.pageHeightPoints,
          );
          const offset = (y * canvas.width + x) * 4;
          return [...data.slice(offset, offset + 3)];
        }
        const x = Math.round(bounds.minX + (bounds.maxX - bounds.minX) * xRatio);
        const y = Math.round(bounds.minY + (bounds.maxY - bounds.minY) * yRatio);
        const offset = (y * canvas.width + x) * 4;
        return [...data.slice(offset, offset + 3)];
      };
      return {
        width: canvas.width,
        height: canvas.height,
        bounds,
        effectivePpi: artwork ? 72 / Math.min(
          (artwork.pageWidthPoints - artwork.safeMarginPoints * 2) / artwork.width,
          (artwork.pageHeightPoints - artwork.safeMarginPoints * 2) / artwork.height,
        ) : null,
        artworkSamples: artwork
          ? artwork.locations.map(([x, y]) => sample(x, y))
          : [
            sample(0.1, 0.1),
            sample(0.9, 0.1),
            sample(0.1, 0.9),
            sample(0.9, 0.9),
            sample(0.5, 0.5),
          ],
      };
    }, { pngBase64: png.toString('base64'), artwork });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makePhotoFile(page, width, height, name) {
  const dataUrl = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#303030';
    context.fillRect(0, 0, width, height);
    const cornerWidth = Math.round(width * 0.2);
    const cornerHeight = Math.round(height * 0.2);
    [
      [0, 0, '#e53935'],
      [width - cornerWidth, 0, '#43a047'],
      [0, height - cornerHeight, '#1e88e5'],
      [width - cornerWidth, height - cornerHeight, '#fdd835'],
    ].forEach(([x, y, color]) => {
      context.fillStyle = color;
      context.fillRect(x, y, cornerWidth, cornerHeight);
    });
    context.fillStyle = '#ab47bc';
    context.beginPath();
    context.arc(width / 2, height / 2, Math.min(width, height) * 0.08, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/png');
  }, { width, height });

  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
  };
}

async function importPhoto(page, dimensions, name, { assertStageRatio = true } = {}) {
  const file = await makePhotoFile(page, dimensions.width, dimensions.height, name);
  await page.locator('[data-testid="input-photo"]').setInputFiles(file);

  const reference = page.locator('[data-testid="img-reference"]');
  const stage = page.locator('[data-testid="canvas-stage"]');
  const stagePhoto = stage.locator('img.base-photo');
  await reference.waitFor({ state: 'visible' });
  await stagePhoto.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="img-reference"]');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });

  const details = await page.evaluate(() => {
    const referenceImage = document.querySelector('[data-testid="img-reference"]');
    const stage = document.querySelector('[data-testid="canvas-stage"]');
    const stageImage = stage?.querySelector('img.base-photo');
    if (!(referenceImage instanceof HTMLImageElement) || !(stage instanceof HTMLElement)
      || !(stageImage instanceof HTMLImageElement)) {
      throw new Error('Imported photo is missing from the reference or drawing stage.');
    }
    const stageBounds = stage.getBoundingClientRect();
    const project = document.querySelector('.canvas-meta')?.textContent ?? '';
    const [projectWidth, projectHeight] = project.split('×').map(value => Number(value.trim()));
    return {
      reference: {
        width: referenceImage.naturalWidth,
        height: referenceImage.naturalHeight,
        objectFit: getComputedStyle(referenceImage).objectFit,
      },
      stagePhoto: {
        width: stageImage.naturalWidth,
        height: stageImage.naturalHeight,
        objectFit: getComputedStyle(stageImage).objectFit,
      },
      stage: { width: stageBounds.width, height: stageBounds.height },
      project: { width: projectWidth, height: projectHeight },
    };
  });

  assert.deepEqual(details.reference, {
    width: dimensions.width,
    height: dimensions.height,
    objectFit: 'contain',
  }, `${name}: reference preview should show the original photo without cropping`);
  assert.deepEqual(details.stagePhoto, {
    width: dimensions.width,
    height: dimensions.height,
    objectFit: 'contain',
  }, `${name}: stage should contain the original photo`);
  assert.ok(details.project.width > 0 && details.project.height > 0, `${name}: project dimensions should be visible`);
  assertClose(details.project.width / details.project.height, dimensions.width / dimensions.height, `${name}: project ratio`);
  if (assertStageRatio) {
    assertClose(details.stage.width / details.stage.height, dimensions.width / dimensions.height, `${name}: rendered stage ratio`);
  }

  return details.project;
}

async function captureProjectState(page) {
  return page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
    const reference = document.querySelector('[data-testid="img-reference"]');
    const stage = document.querySelector('[data-testid="canvas-stage"]');
    const stagePhoto = stage?.querySelector('img.base-photo');
    return {
      project,
      reference: reference instanceof HTMLImageElement
        ? { src: reference.src, width: reference.naturalWidth, height: reference.naturalHeight }
        : null,
      stagePhoto: stagePhoto instanceof HTMLImageElement
        ? { src: stagePhoto.src, width: stagePhoto.naturalWidth, height: stagePhoto.naturalHeight }
        : null,
      dimensions: document.querySelector('.canvas-meta')?.textContent?.trim() ?? null,
      stageRatio: stage instanceof HTMLElement ? stage.style.aspectRatio : null,
      layers: [...document.querySelectorAll('canvas[data-testid^="canvas-layer-"]')].map(canvas => ({
        id: canvas.getAttribute('data-testid'),
        width: canvas.width,
        height: canvas.height,
      })),
    };
  });
}

async function inspectPhotoStrokeAlignment(page, stroke, landmark) {
  return page.evaluate(({ point, landmark }) => {
    const photo = document.querySelector('.base-photo');
    const canvas = document.querySelector('canvas.draw-surface');
    if (!(photo instanceof HTMLImageElement) || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('The reference photo or drawing canvas is missing.');
    }
    const photoRect = photo.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const photoX = photoRect.left + landmark.x * photoRect.width;
    const photoY = photoRect.top + landmark.y * photoRect.height;
    const strokeX = canvasRect.left + point.x * canvasRect.width;
    const strokeY = canvasRect.top + point.y * canvasRect.height;
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = photo.naturalWidth;
    photoCanvas.height = photo.naturalHeight;
    const photoContext = photoCanvas.getContext('2d');
    const drawingContext = canvas.getContext('2d');
    if (!photoContext || !drawingContext) throw new Error('Could not inspect photo and drawing pixels.');
    photoContext.drawImage(photo, 0, 0);
    const photoPixel = photoContext.getImageData(
      Math.round(landmark.x * (photoCanvas.width - 1)),
      Math.round(landmark.y * (photoCanvas.height - 1)),
      1,
      1,
    ).data;
    const strokePixel = drawingContext.getImageData(
      Math.round(point.x * (canvas.width - 1)),
      Math.round(point.y * (canvas.height - 1)),
      1,
      1,
    ).data;
    return {
      screenError: Math.hypot(photoX - strokeX, photoY - strokeY),
      photoColor: [...photoPixel].slice(0, 3),
      strokePixelAlpha: strokePixel[3],
      photoBounds: [photoRect.left, photoRect.top, photoRect.width, photoRect.height],
      canvasBounds: [canvasRect.left, canvasRect.top, canvasRect.width, canvasRect.height],
    };
  }, { point: stroke.points[0], landmark });
}

for (const photo of [
  { name: 'landscape', width: 600, height: 400 },
  { name: 'portrait', width: 400, height: 600 },
]) {
  test(`keeps a ${photo.name} sketch aligned when the editor narrows`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(appUrl);
      await importPhoto(page, photo, `resize-alignment-${photo.name}.png`);

      const stage = page.getByTestId('canvas-stage');
      const wideStage = await stage.boundingBox();
      const photoBounds = await stage.locator('img.base-photo').boundingBox();
      assert.ok(wideStage && photoBounds, `${photo.name}: the fitted photo and stage should be visible`);
      const landmark = { x: 0.1, y: 0.1 };
      await page.mouse.click(
        photoBounds.x + photoBounds.width * landmark.x,
        photoBounds.y + photoBounds.height * landmark.y,
      );
      await waitForStrokeCount(page, 0, 1);

      const before = await captureProjectState(page);
      const originalStroke = before.project.layers[0].strokes[0];
      assertClose(originalStroke.points[0].x, landmark.x, `${photo.name}: saved stroke x coordinate`);
      assertClose(originalStroke.points[0].y, landmark.y, `${photo.name}: saved stroke y coordinate`);
      const surface = page.locator('canvas.draw-surface');
      const originalDrawing = await surface.evaluate(canvas => canvas.toDataURL());
      const initial = await inspectPhotoStrokeAlignment(page, originalStroke, {
        ...landmark,
        photoColor: [229, 57, 53],
      });
      assert.ok(initial.screenError < 3, `${photo.name}: initial stroke should mark the same photo detail`);
      assert.deepEqual(initial.photoColor, [229, 57, 53], `${photo.name}: marker should be the known red photo detail`);
      assert.ok(initial.strokePixelAlpha > 0, `${photo.name}: the stroke should render on its saved canvas point`);
      assert.deepEqual(initial.photoBounds, initial.canvasBounds, `${photo.name}: photo and drawing bounds should match`);

      for (let step = 0; step < 2; step += 1) await page.getByTestId('button-zoom-in').click();
      const zoom = page.getByTestId('input-photo-zoom');
      assert.equal(await zoom.inputValue(), '150', `${photo.name}: zoom should be above fit before resizing`);
      await page.getByTestId('button-pan-mode').click();
      await page.mouse.move(wideStage.x + wideStage.width / 2, wideStage.y + wideStage.height / 2);
      await page.mouse.down();
      await page.mouse.move(wideStage.x + wideStage.width / 2 + 40, wideStage.y + wideStage.height / 2 - 24, { steps: 4 });
      await page.mouse.up();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(width => {
        const resizedStage = document.querySelector('[data-testid="canvas-stage"]');
        return resizedStage instanceof HTMLElement && resizedStage.clientWidth < width;
      }, wideStage.width);
      const resized = await inspectPhotoStrokeAlignment(page, originalStroke, {
        ...landmark,
        photoColor: [229, 57, 53],
      });
      assert.ok(resized.screenError < 3, `${photo.name}: narrowing the editor should preserve landmark alignment`);
      assert.deepEqual(resized.photoColor, [229, 57, 53], `${photo.name}: the same photo landmark should remain under the stroke`);
      assert.ok(resized.strokePixelAlpha > 0, `${photo.name}: the saved drawing pixel should remain present after resizing`);
      assert.deepEqual(resized.photoBounds, resized.canvasBounds, `${photo.name}: resized photo and drawing bounds should match`);
      assert.deepEqual((await captureProjectState(page)).project.layers[0].strokes, before.project.layers[0].strokes);

      await page.getByTestId('button-reset-photo-view').click();
      await page.waitForFunction(() => {
        const zoomControl = document.querySelector('[data-testid="input-photo-zoom"]');
        const panControl = document.querySelector('[data-testid="button-pan-mode"]');
        return zoomControl?.value === '100' && panControl?.getAttribute('aria-pressed') === 'false';
      });
      const fitted = await inspectPhotoStrokeAlignment(page, originalStroke, {
        ...landmark,
        photoColor: [229, 57, 53],
      });
      assert.ok(fitted.screenError < 3, `${photo.name}: returning to fit should preserve landmark alignment`);
      assert.deepEqual(fitted.photoColor, [229, 57, 53], `${photo.name}: fit should preserve the reference photo`);
      assert.ok(fitted.strokePixelAlpha > 0, `${photo.name}: fit should preserve the drawing pixels`);
      assert.deepEqual(fitted.photoBounds, fitted.canvasBounds, `${photo.name}: fitted photo and drawing bounds should match`);
      assert.deepEqual((await captureProjectState(page)).project.layers[0].strokes, before.project.layers[0].strokes);
      assert.equal(await surface.evaluate(canvas => canvas.toDataURL()), originalDrawing);
    } finally {
      await page.close();
    }
  });
}

async function exportAndInspect(page, name, dimensions, expectedDimensions = dimensions, expectedPaperSizeMm) {
  await page.evaluate(() => {
    window.__cloudPainterExport = null;
    HTMLAnchorElement.prototype.click = function capturePngDownload() {
      window.__cloudPainterExport = this.href;
    };
  });
  await clickExportAction(page, 'button-export');
  await page.waitForFunction(() => typeof window.__cloudPainterExport === 'string');

  const exported = await page.evaluate(async dimensions => {
    const image = new Image();
    image.src = window.__cloudPainterExport;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const projectRatio = dimensions.width / dimensions.height;
    const paperRatio = canvas.width / canvas.height;
    const contentWidthRatio = projectRatio > paperRatio ? 1 : projectRatio / paperRatio;
    const contentHeightRatio = projectRatio > paperRatio ? paperRatio / projectRatio : 1;
    const contentLeft = (1 - contentWidthRatio) / 2;
    const contentTop = (1 - contentHeightRatio) / 2;
    const locations = [
      [contentLeft + contentWidthRatio * 0.1, contentTop + contentHeightRatio * 0.1],
      [contentLeft + contentWidthRatio * 0.9, contentTop + contentHeightRatio * 0.1],
      [contentLeft + contentWidthRatio * 0.1, contentTop + contentHeightRatio * 0.9],
      [contentLeft + contentWidthRatio * 0.9, contentTop + contentHeightRatio * 0.9],
      [0.5, 0.5],
    ];
    const pixels = locations.map(([x, y]) => {
      const pixel = context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      return [pixel[0], pixel[1], pixel[2]];
    });
    const pngBytes = Uint8Array.from(atob(window.__cloudPainterExport.slice('data:image/png;base64,'.length)), character => character.charCodeAt(0));
    const readUint32 = offset => pngBytes[offset] * 0x1000000
      + (pngBytes[offset + 1] << 16)
      + (pngBytes[offset + 2] << 8)
      + pngBytes[offset + 3];
    let physicalResolution = null;
    for (let offset = 8; offset + 12 <= pngBytes.length;) {
      const length = readUint32(offset);
      const type = String.fromCharCode(...pngBytes.subarray(offset + 4, offset + 8));
      if (type === 'pHYs') {
        physicalResolution = {
          pixelsPerMeterX: readUint32(offset + 8),
          pixelsPerMeterY: readUint32(offset + 12),
          unit: pngBytes[offset + 16],
        };
        break;
      }
      offset += length + 12;
    }
    return { width: canvas.width, height: canvas.height, pixels, physicalResolution };
  }, dimensions);

  assert.deepEqual([exported.width, exported.height], [expectedDimensions.width, expectedDimensions.height], `${name}: exported PNG dimensions`);
  assert.deepEqual(exported.pixels, [
    [229, 57, 53],
    [67, 160, 71],
    [30, 136, 229],
    [253, 216, 53],
    [171, 71, 188],
  ], `${name}: export should retain all four photo corners and its center without cropping`);
  if (expectedPaperSizeMm) {
    assert.deepEqual(exported.physicalResolution, {
      pixelsPerMeterX: 11_811,
      pixelsPerMeterY: 11_811,
      unit: 1,
    }, `${name}: PNG should encode 300-dpi print resolution in its pHYs chunk`);
    const paperSizeMm = [
      exported.width / exported.physicalResolution.pixelsPerMeterX * 1000,
      exported.height / exported.physicalResolution.pixelsPerMeterY * 1000,
    ];
    assert.ok(Math.abs(paperSizeMm[0] - expectedPaperSizeMm.width) < 0.03, `${name}: expected printed width ${expectedPaperSizeMm.width} mm, received ${paperSizeMm[0]} mm`);
    assert.ok(Math.abs(paperSizeMm[1] - expectedPaperSizeMm.height) < 0.03, `${name}: expected printed height ${expectedPaperSizeMm.height} mm, received ${paperSizeMm[1]} mm`);
  }
}

async function inspectPdfArtwork(page, locations) {
  await page.evaluate(() => {
    window.__cloudPainterPdfBlob = null;
    window.__cloudPainterNativeCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type !== 'application/pdf') return window.__cloudPainterNativeCreateObjectURL(blob);
      window.__cloudPainterPdfBlob = blob;
      return 'blob:cloudpainter-captured-pdf';
    };
    HTMLAnchorElement.prototype.click = function capturePdfDownload() {
      window.__cloudPainterPdfDownload = this.href;
    };
  });
  await clickExportAction(page, 'button-export-pdf');
  await page.waitForFunction(() => window.__cloudPainterPdfBlob instanceof Blob && window.__cloudPainterPdfBlob.type === 'application/pdf');

  const pdfBase64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await window.__cloudPainterPdfBlob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  });
  const pdfBytes = Buffer.from(pdfBase64, 'base64');
  assert.equal(pdfBytes.subarray(0, 5).toString('ascii'), '%PDF-', 'captured PDF bytes should retain the PDF header');
  const artwork = await renderPdfWithPoppler(pdfBytes, page, {
    width: 1200,
    height: 800,
    pageWidthPoints: 612,
    pageHeightPoints: 792,
    safeMarginPoints: 36,
    renderDpi: 288,
    locations,
  });
  return {
    width: 1200,
    height: 800,
    effectivePpi: artwork.effectivePpi,
    pixels: artwork.artworkSamples,
  };
}

async function drawStroke(page, { startX, endX, y }) {
  const surface = page.locator('canvas.draw-surface');
  const bounds = await surface.boundingBox();
  assert.ok(bounds, 'selected drawing layer should have a visible canvas');
  await page.mouse.move(bounds.x + bounds.width * startX, bounds.y + bounds.height * y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * endX, bounds.y + bounds.height * y, { steps: 5 });
  await page.mouse.up();
}

async function chooseDrawingColor(page, hex) {
  await page.getByTestId('input-color-hex').fill(hex);
  await page.getByTestId('button-apply-color').click();
  await page.waitForFunction(value => document.querySelector('[data-testid="selected-color"]')?.textContent?.includes(value.toUpperCase()), hex);
}

async function waitForStrokeCount(page, layerIndex, count) {
  await page.waitForFunction(({ layerIndex, count }) => {
    const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
    return project?.layers?.[layerIndex]?.strokes?.length === count;
  }, { layerIndex, count });
}

async function inspectExportedPixels(page, locations) {
  await page.evaluate(() => {
    window.__cloudPainterExport = null;
    HTMLAnchorElement.prototype.click = function capturePngDownload() {
      window.__cloudPainterExport = this.href;
    };
  });
  await clickExportAction(page, 'button-export');
  await page.waitForFunction(() => typeof window.__cloudPainterExport === 'string');

  return page.evaluate(async locations => {
    const image = new Image();
    image.src = window.__cloudPainterExport;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: locations.map(([x, y]) => [
        ...context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data,
      ]),
    };
  }, locations);
}

test('uses distinct filenames for original-size and high-resolution PNG exports', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(appUrl);
    await openExportMenu(page);
    const exportSize = await exportControl(page, 'select-export-size');

    assert.equal(await exportSize.inputValue(), '1', 'original size should be the default export size');
    const [originalDownload] = await Promise.all([
      page.waitForEvent('download'),
      clickExportAction(page, 'button-export'),
    ]);
    assert.equal(originalDownload.suggestedFilename(), 'Untitled-idea.png');

    await (await exportControl(page, 'select-export-size')).selectOption('2');
    const [highResolutionDownload] = await Promise.all([
      page.waitForEvent('download'),
      clickExportAction(page, 'button-export'),
    ]);
    assert.equal(highResolutionDownload.suggestedFilename(), 'Untitled-idea-2x.png');
  } finally {
    await page.close();
  }
});

test('exports only visible sketch layers and preserves their opacity', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);

    await drawStroke(page, { startX: 0.15, endX: 0.35, y: 0.25 });
    await waitForStrokeCount(page, 0, 1);

    await page.getByTestId('button-add-layer').click();
    await drawStroke(page, { startX: 0.4, endX: 0.6, y: 0.5 });
    await waitForStrokeCount(page, 1, 1);
    const hiddenLayer = page.locator('[data-testid^="layer-row-"]').filter({ hasText: 'Layer 2' });
    await hiddenLayer.getByRole('button', { name: 'Hide layer' }).click();

    await page.getByTestId('button-add-layer').click();
    await page.getByTestId('disclosure-opacity').click();
    const opacity = page.getByTestId('input-layer-opacity');
    await opacity.focus();
    await opacity.press('Home');
    for (let step = 0; step < 40; step++) await opacity.press('ArrowRight');
    await drawStroke(page, { startX: 0.65, endX: 0.85, y: 0.75 });
    await waitForStrokeCount(page, 2, 1);

    assert.equal(await (await exportControl(page, 'select-export-size')).inputValue(), '1', 'original size should be the default export size');
    const originalState = await captureProjectState(page);
    const exported = await inspectExportedPixels(page, [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
    ]);
    assert.deepEqual([exported.width, exported.height], [1200, 800], 'blank sketch export should retain project dimensions');
    assert.deepEqual(exported.pixels[0], [49, 93, 77, 255], 'fully opaque visible layer should remain fully opaque');
    assert.deepEqual(exported.pixels[1], [0, 0, 0, 0], 'hidden layer stroke should be absent from the PNG');
    const translucentColor = exported.pixels[2].slice(0, 3);
    assert.ok(
      translucentColor.every((channel, index) => Math.abs(channel - [49, 93, 77][index]) <= 3),
      `visible translucent layer should retain its stroke color; received ${translucentColor}`,
    );
    assert.ok(Math.abs(exported.pixels[2][3] - 102) <= 1, `40% layer opacity should export at about 40% alpha; received ${exported.pixels[2][3]}`);

    await (await exportControl(page, 'select-export-size')).selectOption('2');
    const highResolution = await inspectExportedPixels(page, [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
    ]);
    assert.deepEqual([highResolution.width, highResolution.height], [2400, 1600], '2× export should double the PNG dimensions');
    assert.deepEqual(highResolution.pixels[0], [49, 93, 77, 255], '2× export should retain fully opaque visible strokes');
    assert.deepEqual(highResolution.pixels[1], [0, 0, 0, 0], '2× export should keep hidden layers transparent');
    assert.ok(Math.abs(highResolution.pixels[2][3] - 102) <= 1, '2× export should preserve visible layer opacity');
    const exportedState = await captureProjectState(page);
    assert.deepEqual(exportedState.dimensions, originalState.dimensions, 'export size should not change the displayed project dimensions');
    assert.deepEqual(exportedState.stageRatio, originalState.stageRatio, 'export size should not change the canvas shape');
    assert.deepEqual(exportedState.layers, originalState.layers, 'export size should not resize drawing layers');
    assert.deepEqual(
      [exportedState.project.width, exportedState.project.height],
      [originalState.project.width, originalState.project.height],
      'export size should not change the saved project dimensions',
    );
  } finally {
    await page.close();
  }
});

test('PDF artwork omits hidden strokes and preserves visible layer order and opacity', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);

    await chooseDrawingColor(page, '#FF0000');
    await drawStroke(page, { startX: 0.2, endX: 0.8, y: 0.5 });
    await waitForStrokeCount(page, 0, 1);

    await page.getByTestId('button-add-layer').click();
    await chooseDrawingColor(page, '#00FF00');
    await drawStroke(page, { startX: 0.3, endX: 0.7, y: 0.7 });
    await waitForStrokeCount(page, 1, 1);
    const hiddenLayer = page.locator('[data-testid^="layer-row-"]').filter({ hasText: 'Layer 2' });
    await hiddenLayer.getByRole('button', { name: 'Hide layer' }).click();

    await page.getByTestId('button-add-layer').click();
    await chooseDrawingColor(page, '#0000FF');
    await page.getByTestId('disclosure-opacity').click();
    const opacity = page.getByTestId('input-layer-opacity');
    await opacity.focus();
    await opacity.press('Home');
    for (let step = 0; step < 40; step++) await opacity.press('ArrowRight');
    assert.equal(await opacity.inputValue(), '40', 'top drawing layer should be set to 40% opacity');
    await drawStroke(page, { startX: 0.2, endX: 0.8, y: 0.5 });
    await waitForStrokeCount(page, 2, 1);

    const exported = await inspectPdfArtwork(page, [
      [0.5, 0.5],
      [0.5, 0.7],
    ]);
    assert.deepEqual([exported.width, exported.height], [1200, 800], 'PDF should embed artwork at the sketch dimensions');
    const overlap = exported.pixels[0];
    assert.ok(
      Math.abs(overlap[0] - 153) <= 30
        && overlap[1] <= 30
        && Math.abs(overlap[2] - 102) <= 30,
      `overlapping artwork should show 40% blue over opaque red, in layer order; received ${overlap}`,
    );
    const hiddenOnly = exported.pixels[1];
    assert.ok(
      hiddenOnly.every(channel => Math.abs(channel - 255) <= 3),
      `a hidden green stroke should be absent from the white PDF artwork; received ${hiddenOnly}`,
    );
  } finally {
    await page.close();
  }
});

test('keeps fine sketch marks in the PDF image and reports effective print resolution', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await openExportMenu(page);
    const resolutionStatus = page.getByTestId('pdf-resolution-status');
    assert.match(await resolutionStatus.innerText(), /160 PPI.*Fine details may look soft/);
    assert.equal(await resolutionStatus.getAttribute('data-quality'), 'limited');
    assert.equal(await resolutionStatus.getAttribute('role'), 'status', 'softness feedback should be non-blocking status text');

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.draw-surface');
      const context = canvas?.getContext('2d');
      if (!context) throw new Error('Could not create the fine-detail PDF fixture.');
      context.fillStyle = '#111111';
      context.fillRect(200, 400, 800, 1);
      context.fillRect(600, 300, 4, 4);
    });
    const exported = await inspectPdfArtwork(page, [
      [0.5, 400.5 / 800],
      [0.5, 0.49],
      [602 / 1200, 302 / 800],
      [610 / 1200, 302 / 800],
    ]);
    assert.deepEqual([exported.width, exported.height], [1200, 800], 'PDF should retain the sketch pixel dimensions rather than inventing resolution');
    assert.equal(exported.effectivePpi, 160, 'rendered PDF should place the 1200-pixel sketch at 160 PPI on Letter paper');
    assert.ok(exported.pixels[0].slice(0, 3).every(channel => channel < 210), `one-pixel stroke should remain visible in the embedded PDF image; received ${exported.pixels[0]}`);
    assert.ok(exported.pixels[1].slice(0, 3).every(channel => channel > 235), `one-pixel stroke should remain distinct from blank paper; received ${exported.pixels[1]}`);
    assert.ok(exported.pixels[2].slice(0, 3).every(channel => channel < 180), `small detail should remain visible in the embedded PDF image; received ${exported.pixels[2]}`);
    assert.ok(exported.pixels[3].slice(0, 3).every(channel => channel > 225), `small detail should remain distinct from blank paper; received ${exported.pixels[3]}`);

    await (await exportControl(page, 'select-pdf-orientation')).selectOption('landscape');
    assert.match(await resolutionStatus.innerText(), /120 PPI.*Fine details may look soft/);
  } finally {
    await page.close();
  }

  const highResolutionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await highResolutionPage.goto(appUrl);
    const dimensions = await importPhoto(highResolutionPage, { width: 2400, height: 1600 }, 'high-resolution-print.png');
    assert.deepEqual(dimensions, { width: 2000, height: 1333 }, 'photo imports should use the app-supported maximum sketch dimensions');
    await openExportMenu(highResolutionPage);
    const resolutionStatus = highResolutionPage.getByTestId('pdf-resolution-status');
    assert.match(await resolutionStatus.innerText(), /267 PPI.*Fine details may look soft/);
    assert.equal(await resolutionStatus.getAttribute('data-quality'), 'limited');
  } finally {
    await highResolutionPage.close();
  }

  const lowResolutionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await lowResolutionPage.goto(appUrl);
    const dimensions = await importPhoto(lowResolutionPage, { width: 320, height: 200 }, 'low-resolution-print.png');
    assert.deepEqual(dimensions, { width: 320, height: 200 }, 'the low-resolution fixture should retain its known source pixel dimensions');
    await openExportMenu(lowResolutionPage);
    const resolutionStatus = lowResolutionPage.getByTestId('pdf-resolution-status');
    assert.match(await resolutionStatus.innerText(), /43 PPI.*Fine details may look soft/);
    await (await exportControl(lowResolutionPage, 'select-pdf-margin')).selectOption('0.75');
    assert.match(await resolutionStatus.innerText(), /46 PPI.*Fine details may look soft/, 'the selected safe margin should affect effective resolution');
    await (await exportControl(lowResolutionPage, 'select-pdf-paper')).selectOption('a4');
    await (await exportControl(lowResolutionPage, 'select-pdf-orientation')).selectOption('landscape');
    assert.match(await resolutionStatus.innerText(), /31 PPI.*Fine details may look soft/, 'paper size and orientation should affect effective resolution');
  } finally {
    await lowResolutionPage.close();
  }
});

test('exports complete sketches in portrait and landscape on US Letter and A4 without changing the project', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    const projectDimensions = await importPhoto(page, { width: 960, height: 640 }, 'print-paper-landscape.png');
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      return project?.width > 0 && project?.height > 0 && typeof project?.image === 'string';
    });
    const originalState = await captureProjectState(page);
    for (const paper of [
      { value: 'letter', name: 'US Letter', portrait: { width: 2550, height: 3300 }, landscape: { width: 3300, height: 2550 }, paperPortraitMm: { width: 215.9, height: 279.4 } },
      { value: 'a4', name: 'A4', portrait: { width: 2480, height: 3508 }, landscape: { width: 3508, height: 2480 }, paperPortraitMm: { width: 210, height: 297 } },
    ]) {
      await (await exportControl(page, 'select-export-size')).selectOption(paper.value);
      if (paper.value === 'letter') {
        assert.equal(await (await exportControl(page, 'select-export-orientation')).inputValue(), 'match-sketch', `${paper.name}: orientation should initially match the sketch`);
      }
      for (const orientation of ['portrait', 'landscape']) {
        await (await exportControl(page, 'select-export-orientation')).selectOption(orientation);
        await exportAndInspect(
          page,
          `${orientation} ${paper.name}`,
          projectDimensions,
          paper[orientation],
          orientation === 'portrait'
            ? paper.paperPortraitMm
            : { width: paper.paperPortraitMm.height, height: paper.paperPortraitMm.width },
        );
      }
    }
    const stateAfterExport = await captureProjectState(page);
    assert.deepEqual(stateAfterExport.dimensions, originalState.dimensions, 'displayed project dimensions should remain unchanged');
    assert.deepEqual(stateAfterExport.stageRatio, originalState.stageRatio, 'canvas shape should remain unchanged');
    assert.deepEqual(stateAfterExport.layers, originalState.layers, 'drawing-layer dimensions should remain unchanged');
    assert.deepEqual(
      [stateAfterExport.project.width, stateAfterExport.project.height],
      [originalState.project.width, originalState.project.height],
      'saved project dimensions should remain unchanged',
    );

    const portraitPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await portraitPage.goto(appUrl);
      const portraitDimensions = await importPhoto(portraitPage, { width: 640, height: 960 }, 'print-paper-portrait.png');
      for (const paper of [
        { value: 'letter', name: 'US Letter', portrait: { width: 2550, height: 3300 }, landscape: { width: 3300, height: 2550 }, paperPortraitMm: { width: 215.9, height: 279.4 } },
        { value: 'a4', name: 'A4', portrait: { width: 2480, height: 3508 }, landscape: { width: 3508, height: 2480 }, paperPortraitMm: { width: 210, height: 297 } },
      ]) {
        await (await exportControl(portraitPage, 'select-export-size')).selectOption(paper.value);
        if (paper.value === 'letter') {
          assert.equal(await (await exportControl(portraitPage, 'select-export-orientation')).inputValue(), 'match-sketch', `${paper.name}: orientation should initially match the portrait sketch`);
        }
        for (const orientation of ['portrait', 'landscape']) {
          await (await exportControl(portraitPage, 'select-export-orientation')).selectOption(orientation);
          await exportAndInspect(
            portraitPage,
            `${orientation} ${paper.name} portrait sketch`,
            portraitDimensions,
            paper[orientation],
            orientation === 'portrait'
              ? paper.paperPortraitMm
              : { width: paper.paperPortraitMm.height, height: paper.paperPortraitMm.width },
          );
        }
      }
    } finally {
      await portraitPage.close();
    }
  } finally {
    await page.close();
  }
});

test('downloads complete Letter and A4 PDFs in portrait and landscape without changing the sketch', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await importPhoto(page, { width: 960, height: 640 }, 'pdf-artwork.png');
    await drawStroke(page, { startX: 0.4, endX: 0.6, y: 0.45 });
    await waitForStrokeCount(page, 0, 1);
    const before = await captureProjectState(page);
    const sourceRatio = before.project.width / before.project.height;
    assert.equal(await (await exportControl(page, 'select-pdf-margin')).inputValue(), '0.5', 'PDF safe margin should default to a common printer-safe inset');
    const title = before.project.title.trim().replace(/[^\w-]+/g, '-') || 'cloudpainter-idea';

    for (const paper of [
      { value: 'letter', name: 'US Letter', portrait: { width: 612, height: 792 }, landscape: { width: 792, height: 612 } },
      { value: 'a4', name: 'A4', portrait: { width: 595.28, height: 841.89 }, landscape: { width: 841.89, height: 595.28 } },
    ]) {
      await (await exportControl(page, 'select-pdf-paper')).selectOption(paper.value);
      for (const orientation of ['portrait', 'landscape']) {
        await (await exportControl(page, 'select-pdf-orientation')).selectOption(orientation);
        for (const margin of [
          { value: '0.25', points: 18 },
          { value: '0.5', points: 36 },
          { value: '0.75', points: 54 },
        ]) {
          await (await exportControl(page, 'select-pdf-margin')).selectOption(margin.value);
          await page.waitForFunction(() => {
            const image = document.querySelector('[data-testid="pdf-layout-artwork-image"]');
            return image instanceof SVGImageElement
              && image.getAttribute('href')?.startsWith('data:image/jpeg;base64,');
          }, null, { timeout: 5_000 });
          const previewLayout = await page.evaluate(() => {
            const pagePreview = document.querySelector('[data-testid="pdf-layout-preview"] svg');
            const safeArea = document.querySelector('[data-testid="pdf-layout-safe-area"]');
            const artwork = document.querySelector('[data-testid="pdf-layout-artwork"]');
            const artworkImage = document.querySelector('[data-testid="pdf-layout-artwork-image"]');
            if (!(pagePreview instanceof SVGSVGElement)
              || !(safeArea instanceof SVGRectElement)
              || !(artwork instanceof SVGRectElement)
              || !(artworkImage instanceof SVGImageElement)) {
              throw new Error('The selected PDF layout preview is missing.');
            }
            const readRect = element => ({
              x: Number(element.getAttribute('x')),
              y: Number(element.getAttribute('y')),
              width: Number(element.getAttribute('width')),
              height: Number(element.getAttribute('height')),
            });
            return {
              pageWidth: Number(pagePreview.getAttribute('data-page-width')),
              pageHeight: Number(pagePreview.getAttribute('data-page-height')),
              margin: Number(pagePreview.getAttribute('data-safe-margin')),
              safeArea: readRect(safeArea),
              artwork: readRect(artwork),
              artworkImage: readRect(artworkImage),
            };
          });
          assertClose(previewLayout.margin, margin.points, `${paper.name} ${orientation}: preview safe margin`);
          const [download] = await Promise.all([
            page.waitForEvent('download'),
            clickExportAction(page, 'button-export-pdf'),
          ]);
          assert.equal(
            download.suggestedFilename(),
            `${title}-${paper.value}-${orientation}.pdf`,
            `${paper.name} ${orientation}: PDF filename`,
          );
          const pdfBytes = await readFile(await download.path());
          const pdf = pdfBytes.toString('latin1');
          const pageBox = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
          assert.ok(pageBox, `${paper.name} ${orientation}: PDF page should have a MediaBox`);
          const pageWidth = Number(pageBox[1]);
          const pageHeight = Number(pageBox[2]);
          assertClose(pageWidth, paper[orientation].width, `${paper.name} ${orientation}: page width in points`);
          assertClose(pageHeight, paper[orientation].height, `${paper.name} ${orientation}: page height in points`);
          assertClose(previewLayout.pageWidth, pageWidth, `${paper.name} ${orientation}: preview page width should match the PDF`);
          assertClose(previewLayout.pageHeight, pageHeight, `${paper.name} ${orientation}: preview page height should match the PDF`);
          assertClose(previewLayout.safeArea.x, margin.points, `${paper.name} ${orientation}: preview printable area's left edge`);
          assertClose(previewLayout.safeArea.y, margin.points, `${paper.name} ${orientation}: preview printable area's top edge`);
          assertClose(previewLayout.safeArea.width, pageWidth - margin.points * 2, `${paper.name} ${orientation}: preview printable area width`);
          assertClose(previewLayout.safeArea.height, pageHeight - margin.points * 2, `${paper.name} ${orientation}: preview printable area height`);

          const content = pdf.match(/5 0 obj\n<< \/Length \d+ >>\nstream\n([\s\S]*?)endstream\nendobj/);
          assert.ok(content, `${paper.name} ${orientation}: PDF should include its image placement instructions`);
          const placement = content[1].match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.-]+) ([\d.-]+) cm \/Im0 Do Q/);
          assert.ok(placement, `${paper.name} ${orientation}: PDF should place the artwork as one complete image`);
          const [artworkWidth, artworkHeight, artworkX, artworkY] = placement.slice(1).map(Number);
          assertClose(previewLayout.artwork.x, artworkX, `${paper.name} ${orientation}: preview artwork left edge should match the PDF`);
          assertClose(previewLayout.artwork.y, artworkY, `${paper.name} ${orientation}: preview artwork top edge should match the PDF`);
          assertClose(previewLayout.artwork.width, artworkWidth, `${paper.name} ${orientation}: preview artwork width should match the PDF`);
          assertClose(previewLayout.artwork.height, artworkHeight, `${paper.name} ${orientation}: preview artwork height should match the PDF`);
          assert.deepEqual(previewLayout.artworkImage, previewLayout.artwork, `${paper.name} ${orientation}: artwork image should fill the selected PDF placement`);
          assertClose(artworkWidth / artworkHeight, sourceRatio, `${paper.name} ${orientation}: artwork should keep the full sketch aspect ratio`);
          assertClose(artworkX + artworkWidth / 2, pageWidth / 2, `${paper.name} ${orientation}: artwork should be centered horizontally`);
          assertClose(artworkY + artworkHeight / 2, pageHeight / 2, `${paper.name} ${orientation}: artwork should be centered vertically`);
          assert.ok(
            artworkX >= margin.points - 0.01
              && artworkY >= margin.points - 0.01
              && artworkX + artworkWidth <= pageWidth - margin.points + 0.01
              && artworkY + artworkHeight <= pageHeight - margin.points + 0.01,
            `${paper.name} ${orientation}: artwork should stay within the selected ${margin.value}-inch print-safe margin`,
          );

          const imageStart = pdf.indexOf('/Subtype /Image /Width');
          assert.ok(imageStart >= 0, `${paper.name} ${orientation}: PDF should embed the sketch artwork`);
          const streamStart = pdf.indexOf('\nstream\n', imageStart);
          assert.ok(streamStart >= 0, `${paper.name} ${orientation}: embedded artwork should have an image stream`);
          const imageHeader = pdf.slice(imageStart, streamStart);
          const imageLength = Number(imageHeader.match(/\/Length (\d+)/)?.[1]);
          assert.ok(Number.isInteger(imageLength) && imageLength > 0, `${paper.name} ${orientation}: embedded artwork should have a valid length`);
          const jpegStart = streamStart + '\nstream\n'.length;
          const jpeg = pdfBytes.subarray(jpegStart, jpegStart + imageLength);
          assert.equal(jpeg.length, imageLength, `${paper.name} ${orientation}: embedded artwork bytes should be complete`);
          const artwork = await page.evaluate(async jpegBase64 => {
            const image = new Image();
            image.src = `data:image/jpeg;base64,${jpegBase64}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not inspect the PDF artwork image.');
            context.drawImage(image, 0, 0);
            return {
              width: canvas.width,
              height: canvas.height,
              pixels: [
                [0.1, 0.1],
                [0.9, 0.1],
                [0.1, 0.9],
                [0.9, 0.9],
                [0.5, 0.5],
                [0.5, 0.45],
              ].map(([x, y]) => [
                ...context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data.slice(0, 3),
              ]),
            };
          }, jpeg.toString('base64'));
          assertClose(artwork.width / artwork.height, sourceRatio, `${paper.name} ${orientation}: embedded image should retain the sketch aspect ratio`);
          const expectedColors = [
            [229, 57, 53],
            [67, 160, 71],
            [30, 136, 229],
            [253, 216, 53],
            [171, 71, 188],
            [49, 93, 77],
          ];
          for (const [index, expected] of expectedColors.entries()) {
            assert.ok(
              artwork.pixels[index].every((channel, channelIndex) => Math.abs(channel - expected[channelIndex]) < 45),
              `${paper.name} ${orientation}: embedded image should preserve artwork marker ${index + 1}; received ${artwork.pixels[index]}`,
          );
          }

          const rendered = await renderPdfWithPoppler(pdfBytes, page);
          const pointPerPixelX = pageWidth / rendered.width;
          const pointPerPixelY = pageHeight / rendered.height;
          const renderedArtwork = {
            left: rendered.bounds.minX * pointPerPixelX,
            top: rendered.bounds.minY * pointPerPixelY,
            right: (rendered.bounds.maxX + 1) * pointPerPixelX,
            bottom: (rendered.bounds.maxY + 1) * pointPerPixelY,
          };
          const rendererTolerancePoints = 2;
          assert.ok(
            Math.abs((renderedArtwork.left + renderedArtwork.right) / 2 - pageWidth / 2) <= rendererTolerancePoints
              && Math.abs((renderedArtwork.top + renderedArtwork.bottom) / 2 - pageHeight / 2) <= rendererTolerancePoints,
            `${paper.name} ${orientation}: PDF viewer rendering should keep the artwork centered`,
          );
          assert.ok(
            renderedArtwork.left >= margin.points - rendererTolerancePoints
              && renderedArtwork.top >= margin.points - rendererTolerancePoints
              && renderedArtwork.right <= pageWidth - margin.points + rendererTolerancePoints
              && renderedArtwork.bottom <= pageHeight - margin.points + rendererTolerancePoints,
            `${paper.name} ${orientation}: rendered artwork should stay within the selected ${margin.value}-inch print-safe margin`,
          );
          for (const [index, expected] of expectedColors.slice(0, 5).entries()) {
            assert.ok(
              rendered.artworkSamples[index].every((channel, channelIndex) => Math.abs(channel - expected[channelIndex]) < 55),
              `${paper.name} ${orientation}: PDF viewer rendering should preserve artwork marker ${index + 1}; received ${rendered.artworkSamples[index]}`,
            );
          }
        }
      }
    }

    assert.deepEqual(await captureProjectState(page), before, 'PDF size and orientation choices must not change the editable sketch');
  } finally {
    await page.close();
  }
});

test('keeps extreme-aspect PDF previews aligned with Letter and A4 downloads', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    const papers = [
      { value: 'letter', name: 'US Letter', portrait: { width: 612, height: 792 }, landscape: { width: 792, height: 612 } },
      { value: 'a4', name: 'A4', portrait: { width: 595.28, height: 841.89 }, landscape: { width: 841.89, height: 595.28 } },
    ];
    const sketches = [
      { name: 'very wide', width: 2000, height: 1 },
      { name: 'very tall', width: 1, height: 2000 },
    ];
    for (const sketch of sketches) {
      const dimensions = await importPhoto(
        page,
        sketch,
        `extreme-${sketch.name.replace(' ', '-')}.png`,
        { assertStageRatio: false },
      );
      await openExportMenu(page);
      const resolutionStatus = page.getByTestId('pdf-resolution-status');
      for (const paper of papers) {
        await (await exportControl(page, 'select-pdf-paper')).selectOption(paper.value);
        for (const orientation of ['portrait', 'landscape']) {
          await (await exportControl(page, 'select-pdf-orientation')).selectOption(orientation);
          await page.waitForFunction(() => {
            const image = document.querySelector('[data-testid="pdf-layout-artwork-image"]');
            return image instanceof SVGImageElement
              && image.getAttribute('href')?.startsWith('data:image/jpeg;base64,');
          }, null, { timeout: 5_000 });
          const previewLayout = await page.evaluate(async () => {
            const pagePreview = document.querySelector('[data-testid="pdf-layout-preview"] svg');
            const safeArea = document.querySelector('[data-testid="pdf-layout-safe-area"]');
            const artwork = document.querySelector('[data-testid="pdf-layout-artwork"]');
            const artworkImage = document.querySelector('[data-testid="pdf-layout-artwork-image"]');
            if (!(pagePreview instanceof SVGSVGElement)
              || !(safeArea instanceof SVGRectElement)
              || !(artwork instanceof SVGRectElement)
              || !(artworkImage instanceof SVGImageElement)) {
              throw new Error('The selected PDF layout preview is missing.');
            }
            const previewImage = new Image();
            previewImage.src = artworkImage.getAttribute('href');
            await previewImage.decode();
            const readRect = element => ({
              x: Number(element.getAttribute('x')),
              y: Number(element.getAttribute('y')),
              width: Number(element.getAttribute('width')),
              height: Number(element.getAttribute('height')),
            });
            return {
              pageWidth: Number(pagePreview.getAttribute('data-page-width')),
              pageHeight: Number(pagePreview.getAttribute('data-page-height')),
              margin: Number(pagePreview.getAttribute('data-safe-margin')),
              safeArea: readRect(safeArea),
              artwork: readRect(artwork),
              image: {
                ...readRect(artworkImage),
                sourceWidth: previewImage.naturalWidth,
                sourceHeight: previewImage.naturalHeight,
              },
            };
          });
          const pageSize = paper[orientation];
          const margin = previewLayout.margin;
          const layoutScale = Math.min(
            (pageSize.width - margin * 2) / dimensions.width,
            (pageSize.height - margin * 2) / dimensions.height,
          );
          const expectedPpi = Math.round(72 / layoutScale);
          assert.match(
            await resolutionStatus.innerText(),
            new RegExp(`Approx\\. ${expectedPpi} PPI`),
            `${sketch.name}, ${paper.name} ${orientation}: resolution should use the limiting page dimension`,
          );
          assertClose(
            previewLayout.image.sourceWidth / previewLayout.image.sourceHeight,
            dimensions.width / dimensions.height,
            `${sketch.name}, ${paper.name} ${orientation}: preview raster should retain the full sketch aspect ratio`,
          );
          assert.deepEqual(
            [previewLayout.image.x, previewLayout.image.y, previewLayout.image.width, previewLayout.image.height],
            [previewLayout.artwork.x, previewLayout.artwork.y, previewLayout.artwork.width, previewLayout.artwork.height],
            `${sketch.name}, ${paper.name} ${orientation}: preview image should fill its centered placement`,
          );

          const [download] = await Promise.all([
            page.waitForEvent('download'),
            clickExportAction(page, 'button-export-pdf'),
          ]);
          const pdfBytes = await readFile(await download.path());
          const pdf = pdfBytes.toString('latin1');
          const pageBox = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
          assert.ok(pageBox, `${sketch.name}, ${paper.name} ${orientation}: PDF should have a MediaBox`);
          const pdfWidth = Number(pageBox[1]);
          const pdfHeight = Number(pageBox[2]);
          assertClose(pdfWidth, pageSize.width, `${sketch.name}, ${paper.name} ${orientation}: PDF page width`);
          assertClose(pdfHeight, pageSize.height, `${sketch.name}, ${paper.name} ${orientation}: PDF page height`);
          assertClose(previewLayout.pageWidth, pdfWidth, `${sketch.name}, ${paper.name} ${orientation}: preview page width should match the PDF`);
          assertClose(previewLayout.pageHeight, pdfHeight, `${sketch.name}, ${paper.name} ${orientation}: preview page height should match the PDF`);
          const content = pdf.match(/5 0 obj\n<< \/Length \d+ >>\nstream\n([\s\S]*?)endstream\nendobj/);
          assert.ok(content, `${sketch.name}, ${paper.name} ${orientation}: PDF should include artwork placement instructions`);
          const placement = content[1].match(/q ([\d.]+) 0 0 ([\d.]+) ([\d.-]+) ([\d.-]+) cm \/Im0 Do Q/);
          assert.ok(placement, `${sketch.name}, ${paper.name} ${orientation}: PDF should place the artwork`);
          const pdfArtwork = placement.slice(1).map(Number);
          assertClose(previewLayout.artwork.x, pdfArtwork[2], `${sketch.name}, ${paper.name} ${orientation}: preview artwork left edge should match the PDF`);
          assertClose(previewLayout.artwork.y, pdfArtwork[3], `${sketch.name}, ${paper.name} ${orientation}: preview artwork top edge should match the PDF`);
          assertClose(previewLayout.artwork.width, pdfArtwork[0], `${sketch.name}, ${paper.name} ${orientation}: preview artwork width should match the PDF`);
          assertClose(previewLayout.artwork.height, pdfArtwork[1], `${sketch.name}, ${paper.name} ${orientation}: preview artwork height should match the PDF`);
          assert.ok(
            Math.abs((pdfArtwork[0] / pdfArtwork[1]) / (dimensions.width / dimensions.height) - 1) < 0.001,
            `${sketch.name}, ${paper.name} ${orientation}: PDF should retain the full sketch aspect ratio after four-decimal placement rounding`,
          );
        }
      }
    }
  } finally {
    await page.close();
  }
});

test('keeps PNG size and export controls on screen on narrow phones', async () => {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  try {
    await page.goto(appUrl);
    const select = await exportControl(page, 'select-export-size');
    await select.selectOption('letter');
    const orientationSelect = await exportControl(page, 'select-export-orientation');
    const exportButton = page.getByTestId('button-export');
    await select.waitFor({ state: 'visible' });
    await orientationSelect.waitFor({ state: 'visible' });
    await exportButton.waitFor({ state: 'visible' });
    for (const width of [402, 320]) {
      await page.setViewportSize({ width, height: 874 });
      const bounds = await exportButton.boundingBox();
      const orientationBounds = await orientationSelect.boundingBox();
      const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
      assert.ok(bounds, `${width}px phone: PNG export button should have visible bounds`);
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= pageWidth, `${width}px phone: PNG export button should fit within the viewport`);
      assert.ok(orientationBounds, `${width}px phone: paper orientation control should have visible bounds`);
      assert.ok(
        orientationBounds.x >= 0 && orientationBounds.x + orientationBounds.width <= pageWidth,
        `${width}px phone: paper orientation control should fit within the viewport`,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        pageWidth,
        `${width}px phone: the page should not scroll horizontally; overflowing elements: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('*')].flatMap(element => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < -1 || bounds.right > window.innerWidth + 1
            ? [{ tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', left: bounds.left, right: bounds.right, width: bounds.width }]
            : [];
        })))}`,
      );
    }
    await orientationSelect.selectOption('landscape');
    assert.equal(await orientationSelect.inputValue(), 'landscape', '320px phone: paper orientation should remain changeable');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
    ]);
    assert.equal(download.suggestedFilename(), 'Untitled-idea.png', '320px phone: PNG export should remain usable');
  } finally {
    await page.close();
  }
});

test('keeps ordinary PNG export local and unchanged unless the explicit Poe confirmation flow is used', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const upscaleRequests = [];
  let failNext = false;
  try {
    // A test-only module response supplies an approved identity without changing
    // production authentication or sending paid inference during regression checks.
    await page.route('**/src/components/Account.tsx*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        export function AccountProvider({ children }) { return children; }
        export function AccountControls() { return null; }
        export function SignInPage() { return null; }
        export function SignUpPage() { return null; }
        export function usePaletteAccount() {
          return { isLoaded: true, userId: 'fixture-owner', sessionId: 'fixture-session' };
        }
      `,
    }));
    await page.route('**/api/images/config*', route => route.fulfill({
      json: { configured: true, signedIn: true, allowed: true, dailyLimit: 15, remaining: 15, globalRemaining: 20 },
    }));
    await page.route('**/api/palette', route => route.fulfill({ json: { revision: 0, colors: [] } }));
    await page.route('**/api/settings*', route => route.fulfill({
      json: { textSize: 100, drawingTool: 'brush', brushStyle: 'round', brushSize: 8 },
    }));
    await page.route('**/api/images/upscale', async route => {
      const submitted = route.request().postDataJSON();
      upscaleRequests.push(submitted);
      if (failNext) {
        await route.fulfill({ status: 502, json: { code: 'invalid_output', error: 'Poe returned no downloadable image.' } });
        return;
      }
      const result = await page.evaluate(async ({ pngBase64, scale }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${pngBase64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth * scale;
        canvas.height = image.naturalHeight * scale;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return { b64_json: canvas.toDataURL('image/png').split(',')[1], mime: 'image/png', width: canvas.width, height: canvas.height };
      }, submitted);
      await route.fulfill({ json: result });
    });
    await page.goto(appUrl);
    await importPhoto(page, { width: 360, height: 240 }, 'local-only-reference.png');
    await page.locator('canvas.draw-surface').scrollIntoViewIfNeeded();
    await drawStroke(page, { startX: 0.25, endX: 0.75, y: 0.5 });
    await waitForStrokeCount(page, 0, 1);
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      return project?.title === 'local-only-reference' && project?.image;
    });
    const before = await captureProjectState(page);

    const scale = page.getByTestId('select-upscale-factor');
    await scale.selectOption('8');
    assert.equal(await scale.inputValue(), '8', 'users can choose 8× without starting a request');
    const upscalePanel = page.locator('.upscale-export');
    const panelText = await upscalePanel.innerText();
    assert.doesNotMatch(panelText, /Assistant chooses the image provider|Please upscale the attached image|2880 × 1920 pixels|merged photo and visible layers are sent to Poe|may use Poe points|Sign in with an approved account/i);
    assert.equal(await upscalePanel.getByRole('link', { name: 'Sign in' }).count(), 0, 'the panel should not show the removed sign-in prompt');
    await page.waitForFunction(() => !document.querySelector('[data-testid="button-upscale-export"]').disabled);
    assert.equal(await page.getByTestId('button-upscale-export').innerText(), 'Review 8× export');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      clickExportAction(page, 'button-export'),
    ]);
    assert.equal(download.suggestedFilename(), 'local-only-reference.png');
    assert.equal(await page.getByTestId('button-export-menu').getAttribute('aria-expanded'), 'false', 'an export should dismiss its menu');
    const localPng = await readFile(await download.path());
    await page.waitForTimeout(600);
    assert.deepEqual(await captureProjectState(page), before, 'choosing a scale and exporting locally must not change the project');
    assert.deepEqual(upscaleRequests, [], 'choosing a scale or ordinary PNG export may not call the upscale endpoint');
    for (const factor of [4, 8]) {
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-testid="button-upscale-export"]');
        return button && !button.disabled;
      });
      await scale.selectOption(String(factor));
      assert.equal(await scale.inputValue(), String(factor), `${factor}× should be selected before review`);
      const reviewButton = page.getByTestId('button-upscale-export');
      await reviewButton.click();
      assert.equal(upscaleRequests.length, factor === 4 ? 0 : 1, 'reviewing the disclosure must not transfer artwork');
      const dialog = page.getByRole('dialog', { name: 'Send this composition to Poe?' });
      const confirmation = dialog;
      try {
        await confirmation.waitFor({ state: 'visible', timeout: 5_000 });
      } catch {
        const state = await page.evaluate(() => ({
          exportMenuOpen: document.querySelector('[data-testid="button-export-menu"]')?.getAttribute('aria-expanded'),
          reviewButton: document.querySelector('[data-testid="button-upscale-export"]')?.outerHTML,
          dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => ({
            visible: !!(dialog.offsetWidth || dialog.offsetHeight || dialog.getClientRects().length),
            text: dialog.textContent,
          })),
        }));
        throw new Error(`${factor}× review did not open: ${JSON.stringify(state)}`);
      }
      assert.match(await dialog.textContent(), /This sends the merged photo and visible layers to Poe Assistant and may use Poe points/i);
      assert.match(await dialog.textContent(), new RegExp(`exactly ${360 * factor} × ${240 * factor} pixels`));
      assert.match(await confirmation.textContent(), new RegExp(`Please upscale the attached image to be ${factor}x`));
      const [upscaledDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }).catch(async () => {
          throw new Error(`${factor}x upscale did not download. Requests: ${JSON.stringify(upscaleRequests.map(request => request.scale))}; feedback: ${await page.locator('.upscale-export').innerText()}; review: ${await confirmation.textContent()}`);
        }),
        dialog.getByTestId('button-confirm-upscale').click(),
      ]);
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(upscaledDownload.suggestedFilename(), `local-only-reference-assistant-${factor}x.png`);
      const submitted = upscaleRequests.at(-1);
      assert.equal(submitted.scale, factor);
      assert.equal(submitted.pngBase64, localPng.toString('base64'), 'Poe receives the same merged photo-plus-visible-stroke composition as local PNG export');
      assert.deepEqual(await captureProjectState(page), before, 'successful upscale export does not change the saved project');
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-testid="button-upscale-export"]');
        return button && !button.disabled;
      });
    }
    failNext = true;
    await page.getByTestId('button-upscale-export').click();
    await page.getByTestId('button-confirm-upscale').click();
    await page.getByTestId('upscale-error').waitFor();
    assert.match(await page.getByTestId('upscale-error').textContent(), /no downloadable image/);
    assert.deepEqual(await captureProjectState(page), before, 'failed upscale export does not change the saved project');
  } finally {
    await page.close();
  }
});

test('reports PNG export failures without announcing a download', async () => {
  for (const failure of ['canvas creation', '2D context', 'PNG encoding']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(appUrl);
      await page.evaluate(failure => {
        window.__cloudPainterDownloadClicks = 0;
        HTMLAnchorElement.prototype.click = function countDownloadClick() {
          window.__cloudPainterDownloadClicks += 1;
        };
        if (failure === 'canvas creation') {
          const createElement = document.createElement.bind(document);
          document.createElement = tagName => {
            if (tagName.toLowerCase() === 'canvas') throw new Error('Canvas creation failed');
            return createElement(tagName);
          };
        } else if (failure === '2D context') {
          HTMLCanvasElement.prototype.getContext = () => null;
        } else {
          HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
        }
      }, failure);

      await clickExportAction(page, 'button-export');
      const status = page.getByTestId('status-toast');
      await status.waitFor({ state: 'visible' });
      assert.match(await status.textContent(), /Could not create the PNG export/);
      assert.doesNotMatch(await status.textContent(), /PNG exported/);
      assert.equal(await page.evaluate(() => window.__cloudPainterDownloadClicks), 0);
    } finally {
      await page.close();
    }
  }
});

test('does not download a partial PNG when a visible layer canvas is unavailable', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      return project?.layers?.some(layer => layer.visible);
    });
    await openExportMenu(page);
    const layerName = await page.evaluate(() => {
      window.__cloudPainterDownloadClicks = 0;
      HTMLAnchorElement.prototype.click = function countDownloadClick() {
        window.__cloudPainterDownloadClicks += 1;
      };
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      const layer = project?.layers?.find(candidate => candidate.visible);
      if (!layer) throw new Error('Expected a visible drawing layer.');
      const canvas = document.querySelector(`[data-testid="canvas-layer-${layer.id}"]`);
      const fiberKey = canvas && Object.keys(canvas).find(key => key.startsWith('__reactFiber$'));
      let fiber = fiberKey ? canvas[fiberKey] : null;
      while (fiber && fiber.stateNode !== canvas) fiber = fiber.return;
      if (typeof fiber?.ref !== 'function') throw new Error('Could not access the visible layer canvas ref.');
      fiber.ref(null);
      return layer.name;
    });

    await page.getByTestId('button-export').click();
    const status = page.getByTestId('status-toast');
    await status.waitFor({ state: 'visible' });
    assert.match(await status.textContent(), new RegExp(`visible layer "${layerName}" could not be read`));
    assert.match(await status.textContent(), /No file was downloaded/);
    assert.equal(await page.evaluate(() => window.__cloudPainterDownloadClicks), 0);
  } finally {
    await page.close();
  }
});

test('Background fills cover the complete drawing layer in PNG and PDF exports', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await chooseDrawingColor(page, '#2367cd');
    await page.getByTestId('disclosure-opacity').click();
    await page.getByTestId('input-layer-opacity').evaluate(input => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '65');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByTestId('button-tool-background').click();
    await page.getByTestId('canvas-stage').click({ position: { x: 100, y: 100 } });
    await waitForStrokeCount(page, 0, 1);
    assert.deepEqual(await page.evaluate(() => {
      const fill = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null').layers[0].strokes[0];
      const canvas = document.querySelector('canvas.draw-surface');
      const sample = canvas.getContext('2d').getImageData(canvas.width - 2, canvas.height - 2, 1, 1).data;
      return { fill, pixel: [...sample] };
    }), {
      fill: { kind: 'background-fill', color: '#2367cd' },
      pixel: [35, 103, 205, 255],
    });

    const png = await inspectExportedPixels(page, [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]);
    assert.deepEqual([png.width, png.height], [1200, 800]);
    for (const pixel of png.pixels) assert.deepEqual(pixel, [35, 103, 205, 166]);

    const pdf = await inspectPdfArtwork(page, [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]);
    for (const pixel of pdf.pixels) {
      assert.ok(Math.abs(pixel[0] - 112) < 12, `PDF fill red channel should stay near 112, received ${pixel[0]}`);
      assert.ok(Math.abs(pixel[1] - 156) < 12, `PDF fill green channel should stay near 156, received ${pixel[1]}`);
      assert.ok(Math.abs(pixel[2] - 223) < 12, `PDF fill blue channel should stay near 223, received ${pixel[2]}`);
    }
  } finally {
    await page.close();
  }
});

test('resetting a hidden, lowered-opacity photo exports its full-strength state without changing drawings', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await importPhoto(page, { width: 600, height: 400 }, 'reset-photo-display-export.png');
    await drawStroke(page, { startX: 0.3, endX: 0.7, y: 0.5 });
    await waitForStrokeCount(page, 0, 1);

    const surface = page.locator('canvas.draw-surface');
    const drawingBeforeReset = await surface.evaluate(canvas => canvas.toDataURL('image/png'));
    const layersBeforeReset = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null').layers,
    );
    const strokeSample = await surface.evaluate(canvas => {
      const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const centerY = Math.round(height * 0.5);
      for (let y = centerY - 2; y <= centerY + 2; y += 1) {
        for (let x = Math.floor(width * 0.4); x <= Math.floor(width * 0.6); x += 1) {
          const offset = (y * width + x) * 4;
          if (data[offset + 3] === 255) {
            return {
              point: [(x + 0.5) / width, (y + 0.5) / height],
              pixel: [...data.slice(offset, offset + 4)],
            };
          }
        }
      }
      throw new Error('Could not find an opaque pixel in the drawing stroke.');
    });

    const source = await page.getByTestId('img-reference').getAttribute('src');
    await page.getByTestId('input-reference-photo-opacity').fill('37');
    await page.getByTestId('button-reference-photo-visibility').click();
    assert.equal(await page.getByTestId('input-reference-photo-opacity').inputValue(), '37');
    assert.equal(await page.getByTestId('button-reference-photo-visibility').getAttribute('aria-pressed'), 'false');
    assert.equal(
      await page.locator('.stage img.base-photo').evaluate(image => getComputedStyle(image).opacity),
      '0',
    );

    const hiddenExport = await inspectExportedPixels(page, [strokeSample.point]);
    assert.deepEqual(hiddenExport.pixels[0], strokeSample.pixel, 'the drawing remains in the PNG while the photo is hidden');

    await page.getByTestId('button-reset-reference-photo-display').click();
    assert.equal(await page.getByTestId('button-reference-photo-visibility').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByTestId('input-reference-photo-opacity').inputValue(), '100');
    assert.equal(
      await page.locator('.stage img.base-photo').evaluate(image => getComputedStyle(image).opacity),
      '1',
    );
    assert.equal(await page.getByTestId('img-reference').getAttribute('src'), source);
    assert.equal(await surface.evaluate(canvas => canvas.toDataURL('image/png')), drawingBeforeReset);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null').layers),
      layersBeforeReset,
    );

    const resetExport = await inspectExportedPixels(page, [[0.5, 0.025], strokeSample.point]);
    assert.deepEqual(resetExport.pixels[0], [48, 48, 48, 255], 'the PNG contains the photo at full opacity');
    assert.deepEqual(resetExport.pixels[1], strokeSample.pixel, 'the reset does not alter the exported drawing pixel');
  } finally {
    await page.close();
  }
});

test('does not download a sketch-only PNG when the photo fails to decode during export', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await importPhoto(page, { width: 360, height: 240 }, 'photo-that-will-fail-during-export.png');
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      return typeof project?.image === 'string' && project.image.startsWith('data:image/');
    });
    await page.reload();
    await page.evaluate(() => {
      window.__cloudPainterDownloadClicks = 0;
      HTMLAnchorElement.prototype.click = function countDownloadClick() {
        window.__cloudPainterDownloadClicks += 1;
      };
      const NativeImage = window.Image;
      window.Image = function SimulatedImageDecodeFailure() {
        const image = new NativeImage();
        Object.defineProperty(image, 'src', {
          configurable: true,
          set: () => queueMicrotask(() => image.dispatchEvent(new Event('error'))),
        });
        return image;
      };
    });

    await clickExportAction(page, 'button-export');
    const status = page.getByTestId('status-toast');
    await status.waitFor({ state: 'visible' });
    assert.match(await status.textContent(), /Could not include the reference photo/i);
    assert.doesNotMatch(await status.textContent(), /PNG exported/);
    assert.equal(await page.evaluate(() => window.__cloudPainterDownloadClicks), 0);
  } finally {
    await page.close();
  }
});

for (const photo of [
  { name: 'landscape photo', width: 960, height: 480 },
  { name: 'portrait photo', width: 480, height: 960 },
]) {
  test(`imports, displays, and exports a proportional ${photo.name}`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(appUrl);
      const project = await importPhoto(page, photo, `${photo.name.replaceAll(' ', '-')}.png`);
      await exportAndInspect(page, photo.name, project);
    } finally {
      await page.close();
    }
  });
}

test('an unreadable photo reports an error without changing the open project', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(appUrl);
    await importPhoto(page, { width: 360, height: 240 }, 'keep-this-photo.png');
    await page.getByTestId('button-add-layer').click();

    const surface = page.locator('canvas.draw-surface');
    const bounds = await surface.boundingBox();
    assert.ok(bounds, 'the selected drawing layer should be visible');
    await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.65);
    await page.mouse.up();
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      return project?.layers?.length === 2 && project.layers[1].strokes.length > 0;
    });

    const before = await captureProjectState(page);
    assert.equal(before.project.layers.length, 2, 'the project should contain both drawing layers');
    assert.ok(before.project.layers.some(layer => layer.strokes.length > 0), 'the existing sketch should contain a stroke');

    await page.locator('[data-testid="input-photo"]').setInputFiles({
      name: 'unreadable.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not a valid JPEG image'),
    });

    const toast = page.getByTestId('status-toast');
    await toast.waitFor({ state: 'visible' });
    assert.match(await toast.textContent(), /could not be opened|could not read/i);
    await page.waitForTimeout(650); // Allow any accidental project autosave to become visible.
    assert.deepEqual(await captureProjectState(page), before);

    await page.reload();
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-testid="img-reference"]');
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });
    assert.deepEqual(await captureProjectState(page), before, 'the original project should remain intact after reload');
  } finally {
    await page.close();
  }
});

test('a pinch-to-one-finger transition and cancelled touch never commit drawing', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.goto(appUrl);
    await importPhoto(page, { width: 480, height: 320 }, 'touch-gesture.png');
    const stage = await page.getByTestId('canvas-stage').boundingBox();
    assert.ok(stage, 'the photo drawing stage should be visible');
    const y = stage.y + stage.height / 2;
    await dispatchTouchPointers(page, [
      { type: 'pointerdown', pointerId: 1, x: stage.x + stage.width * 0.4, y },
      { type: 'pointerdown', pointerId: 2, x: stage.x + stage.width * 0.6, y },
      { type: 'pointermove', pointerId: 1, x: stage.x + stage.width * 0.35, y },
      { type: 'pointermove', pointerId: 2, x: stage.x + stage.width * 0.65, y },
    ]);
    assert.equal(await page.getByTestId('input-photo-zoom').inputValue(), '150');

    // Lift one finger and move the remaining one: this must remain a photo
    // gesture, not resume the draft stroke begun by the first pointer.
    await dispatchTouchPointers(page, [
      { type: 'pointerup', pointerId: 2, x: stage.x + stage.width * 0.65, y },
      { type: 'pointermove', pointerId: 1, x: stage.x + stage.width * 0.3, y: y + 16 },
      { type: 'pointerup', pointerId: 1, x: stage.x + stage.width * 0.3, y: y + 16 },
    ]);
    await page.waitForTimeout(700);
    assert.equal((await savedDrawing(page)).layers[0].strokes.length, 0);

    await dispatchTouchPointers(page, [
      { type: 'pointerdown', pointerId: 3, x: stage.x + stage.width * 0.3, y },
      { type: 'pointermove', pointerId: 3, x: stage.x + stage.width * 0.7, y: y + 20 },
      { type: 'pointercancel', pointerId: 3, x: stage.x + stage.width * 0.7, y: y + 20 },
    ]);
    await page.waitForTimeout(700);
    assert.equal((await savedDrawing(page)).layers[0].strokes.length, 0);

    await dispatchTouchPointers(page, [
      { type: 'pointerdown', pointerId: 4, x: stage.x + stage.width * 0.3, y },
      { type: 'pointermove', pointerId: 4, x: stage.x + stage.width * 0.7, y: y + 24 },
      { type: 'pointerup', pointerId: 4, x: stage.x + stage.width * 0.7, y: y + 24 },
    ]);
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') ?? 'null');
      return project?.layers?.[0]?.strokes?.length === 1;
    }, null, { timeout: 2_000 });
    await touchControl(page, page.getByTestId('button-zoom-in'));
    await touchControl(page, page.getByTestId('button-pan-mode'));
    assert.equal(await page.getByTestId('button-pan-mode').getAttribute('aria-pressed'), 'true');
    await dispatchTouchPointers(page, [
      { type: 'pointerdown', pointerId: 5, x: stage.x + stage.width / 2, y },
      { type: 'pointermove', pointerId: 5, x: stage.x + stage.width / 2 + 24, y: y + 12 },
      { type: 'pointerup', pointerId: 5, x: stage.x + stage.width / 2 + 24, y: y + 12 },
    ]);
    await page.waitForTimeout(700);
    const project = await savedDrawing(page);
    assert.equal(project.layers[0].strokes.length, 1, 'reposition mode must not add drawing strokes');
    assert.notDeepEqual(project.photoPan, { x: 0, y: 0 }, 'reposition mode should move the photo view');
  } finally {
    await page.close();
  }
});

test('pinch zoom and pan stay bounded and reset returns to the fitted photo', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.goto(appUrl);
    await importPhoto(page, { width: 480, height: 320 }, 'bounded-touch-gesture.png');
    const stage = await page.getByTestId('canvas-stage').boundingBox();
    assert.ok(stage, 'the photo drawing stage should be visible');
    const y = stage.y + stage.height / 2;
    await dispatchTouchPointers(page, [
      { type: 'pointerdown', pointerId: 11, x: stage.x + stage.width * 0.4, y },
      { type: 'pointerdown', pointerId: 12, x: stage.x + stage.width * 0.6, y },
      { type: 'pointermove', pointerId: 11, x: stage.x + stage.width * 2.5, y: stage.y + stage.height * 4 },
      { type: 'pointermove', pointerId: 12, x: stage.x + stage.width * 4.5, y: stage.y + stage.height * 4 },
    ]);
    assert.equal(await page.getByTestId('input-photo-zoom').inputValue(), '400');
    await page.waitForTimeout(700);
    const zoomed = await savedDrawing(page);
    const maxPan = { x: stage.width * (4 - 1) / 2 + 1, y: stage.height * (4 - 1) / 2 + 1 };
    assert.ok(
      Math.abs(zoomed.photoPan.x) <= maxPan.x,
      `photoPan.x ${zoomed.photoPan.x} must stay within +/-${maxPan.x}`,
    );
    assert.ok(
      Math.abs(zoomed.photoPan.y) <= maxPan.y,
      `photoPan.y ${zoomed.photoPan.y} must stay within +/-${maxPan.y}`,
    );

    await touchControl(page, page.getByTestId('button-reset-photo-view'));
    assert.equal(await page.getByTestId('input-photo-zoom').inputValue(), '100');
    await page.waitForTimeout(700);
    const reset = await savedDrawing(page);
    assert.deepEqual(reset.photoPan, { x: 0, y: 0 });
  } finally {
    await page.close();
  }
});

test('phone photo-view controls are separated and operable, while desktop sizing stays unchanged', async () => {
  for (const width of [320, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      await page.goto(appUrl);
      await importPhoto(page, { width: 480, height: 320 }, `phone-controls-${width}.png`);
      const controls = await page.locator('.view-controls').boundingBox();
      const stage = await page.getByTestId('canvas-stage').boundingBox();
      assert.ok(controls && stage, 'photo controls and stage should be visible');
      assert.ok(controls.x >= 0 && controls.x + controls.width <= width);
      assert.ok(controls.y >= 0 && controls.y + controls.height <= 844);
      assert.ok(controls.y + controls.height <= stage.y, 'controls must not cover the reference photo');

      const targets = [
        page.getByTestId('button-zoom-out'),
        page.getByTestId('input-photo-zoom'),
        page.getByTestId('button-zoom-in'),
        page.getByTestId('button-pan-mode'),
        page.getByTestId('button-reset-photo-view'),
      ];
      const rectangles = [];
      for (const target of targets) {
        const bounds = await target.boundingBox();
        assert.ok(bounds, 'each photo control should be visible');
        assert.ok(bounds.width >= 44 && bounds.height >= 44, 'each photo control needs a 44px touch target');
        rectangles.push(bounds);
      }
      for (let left = 0; left < rectangles.length; left += 1) {
        for (let right = left + 1; right < rectangles.length; right += 1) {
          const a = rectangles[left];
          const b = rectangles[right];
          assert.ok(
            a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
            'photo controls must not overlap neighboring targets',
          );
        }
      }

      const zoom = page.getByTestId('input-photo-zoom');
      await zoom.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await zoom.inputValue(), '125', 'keyboard adjustment should still work');
      const zoomIn = page.getByTestId('button-zoom-in');
      await traceControlTouch(page, zoomIn);
      await touchControl(page, zoomIn);
      try {
        await waitForZoom(page, 150);
      } catch {
        const trace = await page.evaluate(() => window.__photoControlTouchTrace ?? []);
        assert.equal(await zoom.inputValue(), '150', `touch zoom-in did not update; received events: ${JSON.stringify(trace)}`);
      }
      assert.equal(await zoom.inputValue(), '150');
      await touchControl(page, page.getByTestId('button-zoom-out'));
      await waitForZoom(page, 125);
      assert.equal(await zoom.inputValue(), '125');
      const panMode = page.getByTestId('button-pan-mode');
      await touchControl(page, panMode);
      assert.equal(await panMode.getAttribute('aria-pressed'), 'true');
      await touchControl(page, panMode);
      assert.equal(await panMode.getAttribute('aria-pressed'), 'false');
      await touchControl(page, page.getByTestId('button-reset-photo-view'));
      await waitForZoom(page, 100);
      assert.equal(await zoom.inputValue(), '100');
    } finally {
      await page.close();
    }
  }

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await desktop.goto(appUrl);
    await importPhoto(desktop, { width: 480, height: 320 }, 'desktop-controls.png');
    const buttons = desktop.locator('.view-control-button');
    for (let index = 0; index < await buttons.count(); index += 1) {
      const bounds = await buttons.nth(index).boundingBox();
      assert.ok(bounds);
      assert.equal(bounds.width, 28);
      assert.equal(bounds.height, 28);
    }
    const zoom = desktop.getByTestId('input-photo-zoom');
    const zoomIn = desktop.getByTestId('button-zoom-in');
    await zoomIn.focus();
    await desktop.keyboard.press('Enter');
    assert.equal(await zoom.inputValue(), '125');
    const panMode = desktop.getByTestId('button-pan-mode');
    await panMode.focus();
    await desktop.keyboard.press('Space');
    assert.equal(await panMode.getAttribute('aria-pressed'), 'true');
    const reset = desktop.getByTestId('button-reset-photo-view');
    await reset.focus();
    await desktop.keyboard.press('Enter');
    assert.equal(await zoom.inputValue(), '100');
  } finally {
    await desktop.close();
  }
});
