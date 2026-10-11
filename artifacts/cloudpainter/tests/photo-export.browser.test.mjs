import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
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

async function importPhoto(page, dimensions, name) {
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
  assertClose(details.stage.width / details.stage.height, dimensions.width / dimensions.height, `${name}: rendered stage ratio`);

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

async function exportAndInspect(page, name, dimensions, expectedDimensions = dimensions) {
  await page.evaluate(() => {
    window.__cloudPainterExport = null;
    HTMLAnchorElement.prototype.click = function capturePngDownload() {
      window.__cloudPainterExport = this.href;
    };
  });
  await page.getByTestId('button-export').click();
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
    return { width: canvas.width, height: canvas.height, pixels };
  }, dimensions);

  assert.deepEqual([exported.width, exported.height], [expectedDimensions.width, expectedDimensions.height], `${name}: exported PNG dimensions`);
  assert.deepEqual(exported.pixels, [
    [229, 57, 53],
    [67, 160, 71],
    [30, 136, 229],
    [253, 216, 53],
    [171, 71, 188],
  ], `${name}: export should retain all four photo corners and its center without cropping`);
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
  await page.getByTestId('button-export').click();
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
    const exportButton = page.getByTestId('button-export');
    const exportSize = page.getByTestId('select-export-size');

    assert.equal(await exportSize.inputValue(), '1', 'original size should be the default export size');
    const [originalDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
    ]);
    assert.equal(originalDownload.suggestedFilename(), 'Untitled-idea.png');

    await exportSize.selectOption('2');
    const [highResolutionDownload] = await Promise.all([
      page.waitForEvent('download'),
      exportButton.click(),
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

    assert.equal(await page.getByTestId('select-export-size').inputValue(), '1', 'original size should be the default export size');
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

    await page.getByTestId('select-export-size').selectOption('2');
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
    const select = page.getByTestId('select-export-size');

    const orientationSelect = page.getByTestId('select-export-orientation');
    for (const paper of [
      { value: 'letter', name: 'US Letter', portrait: { width: 2550, height: 3300 }, landscape: { width: 3300, height: 2550 } },
      { value: 'a4', name: 'A4', portrait: { width: 2480, height: 3508 }, landscape: { width: 3508, height: 2480 } },
    ]) {
      await select.selectOption(paper.value);
      if (paper.value === 'letter') {
        assert.equal(await orientationSelect.inputValue(), 'match-sketch', `${paper.name}: orientation should initially match the sketch`);
      }
      for (const orientation of ['portrait', 'landscape']) {
        await orientationSelect.selectOption(orientation);
        await exportAndInspect(
          page,
          `${orientation} ${paper.name}`,
          projectDimensions,
          paper[orientation],
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
      const portraitSelect = portraitPage.getByTestId('select-export-size');
      const portraitOrientation = portraitPage.getByTestId('select-export-orientation');
      for (const paper of [
        { value: 'letter', name: 'US Letter', portrait: { width: 2550, height: 3300 }, landscape: { width: 3300, height: 2550 } },
        { value: 'a4', name: 'A4', portrait: { width: 2480, height: 3508 }, landscape: { width: 3508, height: 2480 } },
      ]) {
        await portraitSelect.selectOption(paper.value);
        if (paper.value === 'letter') {
          assert.equal(await portraitOrientation.inputValue(), 'match-sketch', `${paper.name}: orientation should initially match the portrait sketch`);
        }
        for (const orientation of ['portrait', 'landscape']) {
          await portraitOrientation.selectOption(orientation);
          await exportAndInspect(
            portraitPage,
            `${orientation} ${paper.name} portrait sketch`,
            portraitDimensions,
            paper[orientation],
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

test('keeps PNG size and export controls on screen on narrow phones', async () => {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
  try {
    await page.goto(appUrl);
    const select = page.getByTestId('select-export-size');
    await select.selectOption('letter');
    const orientationSelect = page.getByTestId('select-export-orientation');
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
        `${width}px phone: the page should not scroll horizontally`,
      );
    }
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
    assert.match(await page.getByTestId('upscale-route-disclosure').textContent(), /Nano-Banana-2/i);
    assert.match(await page.getByTestId('upscale-route-disclosure').textContent(), /Please upscale the attached image to be 8x/);
    await page.waitForFunction(() => !document.querySelector('[data-testid="button-upscale-export"]').disabled);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('button-export').click(),
    ]);
    assert.equal(download.suggestedFilename(), 'local-only-reference.png');
    const localPng = await readFile(await download.path());
    await page.waitForTimeout(600);
    assert.deepEqual(await captureProjectState(page), before, 'choosing a scale and exporting locally must not change the project');
    assert.deepEqual(upscaleRequests, [], 'choosing a scale or ordinary PNG export may not call the upscale endpoint');
    for (const factor of [4, 8]) {
      await scale.selectOption(String(factor));
      await page.getByTestId('button-upscale-export').click();
      assert.equal(upscaleRequests.length, factor === 4 ? 0 : 1, 'reviewing the disclosure must not transfer artwork');
      const [upscaledDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }).catch(async () => {
          throw new Error(`${factor}x upscale did not download. Requests: ${upscaleRequests.length}; feedback: ${await page.locator('.upscale-export').innerText()}`);
        }),
        page.getByTestId('button-confirm-upscale').click(),
      ]);
      assert.equal(upscaledDownload.suggestedFilename(), `local-only-reference-assistant-${factor}x.png`);
      const submitted = upscaleRequests.at(-1);
      assert.equal(submitted.scale, factor);
      assert.equal(submitted.pngBase64, localPng.toString('base64'), 'Poe receives the same merged photo-plus-visible-stroke composition as local PNG export');
      assert.deepEqual(await captureProjectState(page), before, 'successful upscale export does not change the saved project');
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

      await page.getByTestId('button-export').click();
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

    await page.getByTestId('button-export').click();
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
