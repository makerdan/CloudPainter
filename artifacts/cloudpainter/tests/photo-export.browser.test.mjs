import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
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

async function exportAndInspect(page, name, dimensions) {
  await page.evaluate(() => {
    window.__cloudPainterExport = null;
    HTMLAnchorElement.prototype.click = function capturePngDownload() {
      window.__cloudPainterExport = this.href;
    };
  });
  await page.getByTestId('button-export').click();
  await page.waitForFunction(() => typeof window.__cloudPainterExport === 'string');

  const exported = await page.evaluate(async () => {
    const image = new Image();
    image.src = window.__cloudPainterExport;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const locations = [
      [0.1, 0.1],
      [0.9, 0.1],
      [0.1, 0.9],
      [0.9, 0.9],
      [0.5, 0.5],
    ];
    const pixels = locations.map(([x, y]) => {
      const pixel = context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      return [pixel[0], pixel[1], pixel[2]];
    });
    return { width: canvas.width, height: canvas.height, pixels };
  });

  assertClose(exported.width / exported.height, dimensions.width / dimensions.height, `${name}: exported PNG ratio`);
  assert.deepEqual(exported.pixels, [
    [229, 57, 53],
    [67, 160, 71],
    [30, 136, 229],
    [253, 216, 53],
    [171, 71, 188],
  ], `${name}: export should retain all four photo corners and its center without cropping`);
}

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
