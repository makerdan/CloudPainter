import { expect, test, type Page } from '@playwright/test';

const STORE_KEY = 'cloudpainter-project-v1';
const PROJECT_HISTORY_KEY = 'cloudpainter-project-history-v1';
const models = ['Nano-Banana-Pro', 'Nano-Banana-2', 'GPT-Image-2.5-Sunburst', 'Flux-2-Turbo'];
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), STORE_KEY);
const approvedConfig = { configured: true, signedIn: true, allowed: true, dailyLimit: 2, remaining: 2, globalRemaining: 20 };

async function failProjectHistoryWrites(page: Page) {
  const installFailure = ({ historyKey, failureKey }: { historyKey: string; failureKey: string }) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && key === historyKey && window.sessionStorage.getItem(failureKey) === 'true') {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      originalSetItem.call(this, key, value);
    };
  };
  const keys = { historyKey: PROJECT_HISTORY_KEY, failureKey: 'cloudpainter-test-history-quota' };
  await page.addInitScript(installFailure, keys);
  await page.evaluate(installFailure, keys);
  await page.evaluate(key => sessionStorage.setItem(key, 'true'), keys.failureKey);
}

test.describe('signed-in generation (provider always stubbed)', () => {
test.use({ storageState: process.env.CLOUDPAINTER_AUTH_STATE });

test.beforeEach(async ({ page }) => {
  if (!process.env.CLOUDPAINTER_AUTH_STATE) throw new Error('Set CLOUDPAINTER_AUTH_STATE to a signed-in Clerk Playwright storage-state file. No paid inference is used.');
  await page.route('**/api/images/config', route => route.fulfill({ json: approvedConfig }));
  await page.goto('./');
  await page.getByTestId('button-add-layer').click();
  await expect.poll(async () => (await saved(page))?.layers.length).toBe(2);
});

test('Poe picker offers exactly four models and preview requires explicit use', async ({ page }) => {
  const initial = await saved(page);
  const priorPhoto = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#b7c8d8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  });
  const priorProject = {
    ...initial,
    image: priorPhoto,
    width: 320,
    height: 240,
    title: 'My careful sketch',
    layers: initial.layers.map((layer: any, index: number) => ({
      ...layer,
      name: index === 0 ? 'Outline' : 'Details',
      strokes: index === 0 ? [{
        points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.6 }],
        color: '#315d4d',
        size: 8,
        tool: 'brush',
        brush: { style: 'round', version: 1, seed: 42 },
      }] : [],
    })),
  };
  await page.evaluate(({ key, project }) => localStorage.setItem(key, JSON.stringify(project)), { key: STORE_KEY, project: priorProject });
  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', priorPhoto);
  const before = await saved(page);

  const originalHistory = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), PROJECT_HISTORY_KEY);

  const olderSketch = { ...before, title: 'Earlier saved sketch' };
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
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY)).toEqual([before]);
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', `data:image/png;base64,${base64}`);
  await expect(page.getByTestId('button-restore-project-0')).toHaveAccessibleName('Restore saved sketch: My careful sketch');
  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', `data:image/png;base64,${base64}`);
  await page.getByTestId('button-restore-project-0').click();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', priorPhoto);
  await expect.poll(async () => saved(page)).toEqual(before);
  await expect(page.getByTestId('button-restore-project-0')).toHaveAccessibleName('Restore saved sketch: Clouds over a blue sky');
  await expect(page.getByTestId('button-restore-project-1')).toHaveAccessibleName('Restore saved sketch: My careful sketch');
  await expect(page.getByText('Outline', { exact: true })).toBeVisible();
  await expect(page.getByText('Details', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', priorPhoto);
  expect((await saved(page)).layers[0].strokes).toEqual(before.layers[0].strokes);
});

test('applying another generated image keeps every earlier sketch available after reload', async ({ page }) => {
  const initial = await saved(page);
  const images = await Promise.all([
    page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#c75d42';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#3975a6';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
  ]);
  await page.route('**/api/images/generate', async route => {
    const prompt = route.request().postDataJSON().prompt as string;
    const index = prompt === 'First generated idea' ? 0 : 1;
    await route.fulfill({ json: { b64_json: images[index], mime: 'image/png' } });
  });

  for (const prompt of ['First generated idea', 'Second generated idea']) {
    await page.getByTestId('button-generate-image').click();
    await page.getByTestId('input-image-prompt').fill(prompt);
    await page.getByTestId('button-submit-generation').click();
    await expect(page.getByTestId('generated-image-preview')).toBeVisible();
    await page.getByTestId('button-use-generated-image').click();
    await expect.poll(async () => (await saved(page))?.title).toBe(prompt);
  }

  const history = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY);
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({
    image: `data:image/png;base64,${images[0]}`, width: 320, height: 240, title: 'First generated idea',
  });
  expect(history[1]).toEqual(initial);
  await page.reload();
  await expect(page.getByTestId('button-restore-project-0')).toHaveAccessibleName('Restore saved sketch: First generated idea');
  await expect(page.getByTestId('button-restore-project-1')).toHaveAccessibleName('Restore saved sketch: Untitled idea');

  await page.getByTestId('button-restore-project-1').click();
  await expect(page.getByTestId('img-reference')).toHaveCount(0);
  await expect.poll(async () => (await saved(page))?.title).toBe('Untitled idea');
  await page.reload();
  await expect(page.getByTestId('button-restore-project-2')).toHaveAccessibleName('Restore saved sketch: Untitled idea');
  await page.getByTestId('button-restore-project-1').click();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', `data:image/png;base64,${images[0]}`);
  await expect.poll(async () => (await saved(page))?.title).toBe('First generated idea');
});

test('a full history store leaves the current sketch and older saved sketches intact when applying an image', async ({ page }) => {
  const before = await saved(page);

  const originalHistory = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), PROJECT_HISTORY_KEY);

  const olderSketch = { ...before, title: 'Earlier saved sketch' };
  const olderSketches = [
    { ...before, title: 'Earlier saved sketch' },
    { ...before, title: 'Oldest saved sketch' },
  ];
  await page.evaluate(({ key, history }) => localStorage.setItem(key, JSON.stringify(history)), {
    key: PROJECT_HISTORY_KEY,
    history: olderSketches,
  });
  const generatedImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 32;
    canvas.getContext('2d')!.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.route('**/api/images/generate', route => route.fulfill({ json: { b64_json: generatedImage, mime: 'image/png' } }));
  await page.getByTestId('button-generate-image').click();
  await page.getByTestId('input-image-prompt').fill('A new starting point');
  await page.getByTestId('button-submit-generation').click();
  await expect(page.getByTestId('generated-image-preview')).toBeVisible();
  await failProjectHistoryWrites(page);

  await page.getByTestId('button-use-generated-image').click();
  await expect(page.getByRole('alert')).toContainText('Could not save a recovery copy of your current sketch. No changes were made.');
  expect(await saved(page)).toEqual(before);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY)).toEqual(olderSketches);

  await page.reload();
  expect(await saved(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Restore saved sketch: Earlier saved sketch' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore saved sketch: Oldest saved sketch' })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY)).toEqual(olderSketches);
});

test('warns before applying a generated image when estimated browser storage is nearly full', async ({ page }) => {
  const before = await saved(page);

  const originalHistory = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), PROJECT_HISTORY_KEY);

  const olderSketch = { ...before, title: 'Earlier saved sketch' };
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

  const originalHistory = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), PROJECT_HISTORY_KEY);

  const olderSketch = { ...before, title: 'Earlier saved sketch' };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/images/config', route => route.fulfill({ json: { ...approvedConfig, configured: false } }));
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

for (const scope of ['account', 'global'] as const) {
  test(`exhausted ${scope} budget disables generation`, async ({ page }) => {
    const config = scope === 'account'
      ? { ...approvedConfig, remaining: 0 }
      : { ...approvedConfig, globalRemaining: 0 };
    await page.route('**/api/images/config', route => route.fulfill({ json: config }));
    await page.getByTestId('button-generate-image').click();
    await expect(page.getByRole('dialog').getByRole('status').filter({ hasText: 'attempts remaining' })).toBeVisible();
    await expect(page.getByTestId('button-submit-generation')).toBeDisabled();
  });
}

test('unapproved accounts cannot submit a prompt', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/images/config', route => route.fulfill({ json: { ...approvedConfig, allowed: false } }));
  await page.route('**/api/images/generate', route => { calls++; return route.abort(); });
  await page.getByTestId('button-generate-image').click();
  await expect(page.getByText('This account is not approved to generate images. Ask the project owner for access.')).toBeVisible();
  await expect(page.getByTestId('button-submit-generation')).toBeDisabled();
  expect(calls).toBe(0);
});
});

test('anonymous visitors can draw but must sign in before generation', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/images/generate', route => { calls++; return route.abort(); });
  await page.goto('./');
  await page.getByTestId('button-add-layer').click();
  await page.getByTestId('button-generate-image').click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByTestId('button-submit-generation')).toBeDisabled();
  expect(calls).toBe(0);
});

test('saved sketches can be browsed and restored without signing in', async ({ page }) => {
  const current = {
    image: null, width: 1200, height: 800, selectedLayerId: 'current-layer', title: 'Current sketch',
    layers: [{ id: 'current-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const earlier = {
    image: null, width: 640, height: 480, selectedLayerId: 'earlier-layer', title: 'Earlier sketch',
    layers: [{ id: 'earlier-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const oldest = {
    image: null, width: 320, height: 240, selectedLayerId: 'oldest-layer', title: 'Oldest sketch',
    layers: [{ id: 'oldest-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };

  const normalizedCurrent = { ...current, photoZoom: 1, photoPan: { x: 0, y: 0 } };
  const normalizedOldest = { ...oldest, photoZoom: 1, photoPan: { x: 0, y: 0 } };
  await page.addInitScript(({ project, history }) => {
    if (sessionStorage.getItem('cloudpainter-history-test-seeded')) return;
    localStorage.setItem('cloudpainter-project-v1', JSON.stringify(project));
    localStorage.setItem('cloudpainter-project-history-v1', JSON.stringify(history));
    sessionStorage.setItem('cloudpainter-history-test-seeded', 'true');
  }, { project: current, history: [earlier, oldest] });
  await page.goto('./');
  await expect(page.getByTestId('button-restore-project-0')).toHaveAccessibleName('Restore saved sketch: Earlier sketch');
  await expect(page.getByTestId('button-restore-project-1')).toHaveAccessibleName('Restore saved sketch: Oldest sketch');
  await page.getByTestId('button-restore-project-1').click();
  await expect.poll(async () => saved(page)).toEqual(normalizedOldest);
  await expect(page.getByTestId('button-restore-project-0')).toHaveAccessibleName('Restore saved sketch: Current sketch');
  await page.reload();
  await expect(page.getByTestId('button-restore-project-1')).toHaveAccessibleName('Restore saved sketch: Earlier sketch');
  await expect(page.getByTestId('button-restore-project-2')).toHaveAccessibleName('Restore saved sketch: Oldest sketch');
  await expect.poll(async () => saved(page)).toEqual(normalizedOldest);
});

test('a full history store leaves the current sketch and saved versions intact when restoring', async ({ page }) => {
  const current = {
    image: null, width: 1200, height: 800, selectedLayerId: 'current-layer', title: 'Current sketch',
    layers: [{ id: 'current-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const earlier = {
    image: null, width: 640, height: 480, selectedLayerId: 'earlier-layer', title: 'Earlier sketch',
    layers: [{ id: 'earlier-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const oldest = {
    image: null, width: 320, height: 240, selectedLayerId: 'oldest-layer', title: 'Oldest sketch',
    layers: [{ id: 'oldest-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };

  const normalizedCurrent = { ...current, photoZoom: 1, photoPan: { x: 0, y: 0 } };
  await page.addInitScript(({ project, history }) => {
    if (sessionStorage.getItem('cloudpainter-history-quota-seeded')) return;
    localStorage.setItem('cloudpainter-project-v1', JSON.stringify(project));
    localStorage.setItem('cloudpainter-project-history-v1', JSON.stringify(history));
    sessionStorage.setItem('cloudpainter-history-quota-seeded', 'true');
  }, { project: current, history: [earlier, oldest] });
  await page.goto('./');
  await expect.poll(async () => (await saved(page))?.photoZoom).toBe(1);
  const before = await saved(page);

  const originalHistory = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), PROJECT_HISTORY_KEY);

  const olderSketch = { ...before, title: 'Earlier saved sketch' };
  const existingHistory = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY);
  await failProjectHistoryWrites(page);

  await page.getByRole('button', { name: 'Restore saved sketch: Oldest sketch' }).click();
  await expect(page.getByTestId('status-toast')).toContainText('Could not save the current sketch before restoring. Nothing changed.');
  expect(await saved(page)).toEqual(before);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY)).toEqual(existingHistory);

  await page.reload();
  expect(await saved(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Restore saved sketch: Earlier sketch' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore saved sketch: Oldest sketch' })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY)).toEqual(existingHistory);
});

test('saved sketches can be deleted without changing the active sketch, including the last entry', async ({ page }) => {
  const current = {
    image: null, width: 1200, height: 800, selectedLayerId: 'current-layer', title: 'Current sketch',
    layers: [{ id: 'current-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const earlier = {
    image: null, width: 640, height: 480, selectedLayerId: 'earlier-layer', title: 'Earlier sketch',
    layers: [{ id: 'earlier-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const oldest = {
    image: null, width: 320, height: 240, selectedLayerId: 'oldest-layer', title: 'Oldest sketch',
    layers: [{ id: 'oldest-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] }],
  };
  const normalizedCurrent = { ...current, photoZoom: 1, photoPan: { x: 0, y: 0 } };
  await page.addInitScript(({ project, history }) => {
    if (sessionStorage.getItem('cloudpainter-delete-test-seeded')) return;
    localStorage.setItem('cloudpainter-project-v1', JSON.stringify(project));
    localStorage.setItem('cloudpainter-project-history-v1', JSON.stringify(history));
    sessionStorage.setItem('cloudpainter-delete-test-seeded', 'true');
  }, { project: current, history: [earlier, oldest] });
  await page.goto('./');

  await expect(page.getByTestId('button-delete-project-0')).toHaveAccessibleName('Delete saved sketch: Earlier sketch');
  await page.getByTestId('button-delete-project-0').click();
  await expect(page.getByTestId('button-restore-project-0')).toHaveAccessibleName('Restore saved sketch: Oldest sketch');
  await expect.poll(async () => saved(page)).toEqual(normalizedCurrent);
  await expect.poll(async () =>
    page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY),
  ).toEqual([expect.objectContaining({ title: 'Oldest sketch' })]);

  await page.reload();
  await expect(page.getByTestId('button-delete-project-0')).toHaveAccessibleName('Delete saved sketch: Oldest sketch');
  await page.getByTestId('button-delete-project-0').click();
  await expect(page.getByRole('region', { name: 'Saved sketches' })).toHaveCount(0);
  await expect.poll(async () =>
    page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), PROJECT_HISTORY_KEY),
  ).toEqual([]);
  await expect.poll(async () => saved(page)).toEqual(normalizedCurrent);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Saved sketches' })).toHaveCount(0);
  await expect.poll(async () => saved(page)).toEqual(normalizedCurrent);
});

test('saved sketches keep their own photo framing across switches and reloads', async ({ page }) => {
  const photo = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  const activeLayer = { id: 'legacy-active-layer', name: 'Active layer', visible: true, opacity: 1, strokes: [], redo: [] };
  const layer = { id: 'malformed-framing-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] };
  const activeSketch = {
    image: photo,
    width: 320,
    height: 240,
    layers: [layer],
    selectedLayerId: layer.id,
    title: 'Zoomed sketch',
    photoZoom: 2,
    photoPan: { x: 36, y: -22 },
  };
  const savedSketch = {
    image: photo,
    width: 320,
    height: 240,
    layers: [layer],
    selectedLayerId: layer.id,
    title: 'Earlier framing',
    photoZoom: 1.5,
    photoPan: { x: -48, y: 30 },
  };
  await page.addInitScript(({ storeKey, historyKey, active, history }) => {
    if (sessionStorage.getItem('cloudpainter-framing-test-seeded')) return;
    sessionStorage.setItem('cloudpainter-framing-test-seeded', '1');
    localStorage.setItem(storeKey, JSON.stringify(active));
    localStorage.setItem(historyKey, JSON.stringify(history));
  }, {
    storeKey: STORE_KEY,
    historyKey: PROJECT_HISTORY_KEY,
    active: activeSketch,
    history: [savedSketch],
  });
  await page.goto('./');

  const stageContent = page.locator('.stage-content');
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('200');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(36px, -22px, 0px\) scale\(2\)/);
  await page.getByTestId('input-photo-zoom').fill('225');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(36px, -22px, 0px\) scale\(2\.25\)/);
  await page.getByTestId('button-pan-mode').click();
  const stageBounds = await stageContent.boundingBox();
  expect(stageBounds).not.toBeNull();
  await page.mouse.move(stageBounds!.x + stageBounds!.width / 2, stageBounds!.y + stageBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stageBounds!.x + stageBounds!.width / 2 + 24, stageBounds!.y + stageBounds!.height / 2 - 12);
  await page.mouse.up();
  await expect(stageContent).toHaveAttribute('style', /translate3d\(60px, -34px, 0px\) scale\(2\.25\)/);
  await page.reload();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('225');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(60px, -34px, 0px\) scale\(2\.25\)/);
  await expect.poll(async () => {
    const project = await saved(page);
    return {
      title: project?.title,
      photoZoom: project?.photoZoom,
      photoPan: project?.photoPan,
      layerNames: project?.layers.map((layer: { name: string }) => layer.name),
    };
  }).toEqual({
    title: 'Legacy active sketch',
    photoZoom: 1,
    photoPan: { x: 0, y: 0 },
    layerNames: ['Active layer', 'Layer 2'],
  });

  await page.getByRole('button', { name: 'Restore saved sketch: Legacy recovery sketch' }).click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(1\)/);

  await page.getByTestId('button-add-layer').click();
  await expect.poll(async () => {
    const project = await saved(page);
    return { title: project?.title, photoZoom: project?.photoZoom, photoPan: project?.photoPan };
  }).toEqual({ title: 'Earlier framing', photoZoom: 1.5, photoPan: { x: -48, y: 30 } });

  await page.reload();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('150');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(-48px, 30px, 0px\) scale\(1\.5\)/);
  await page.getByRole('button', { name: 'Restore saved sketch: Zoomed sketch' }).click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('225');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(60px, -34px, 0px\) scale\(2\.25\)/);
  await page.reload();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('225');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(60px, -34px, 0px\) scale\(2\.25\)/);
});

test('malformed saved photo framing is normalized without disabling the photo or canvas', async ({ page }) => {
  const photo = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  const activeLayer = { id: 'legacy-active-layer', name: 'Active layer', visible: true, opacity: 1, strokes: [], redo: [] };
  const layer = { id: 'malformed-framing-layer', name: 'Layer 1', visible: true, opacity: 1, strokes: [], redo: [] };
    const project = await saved(page);
  const malformedZoom = project('Malformed zoom', 'not-a-number', { x: 'invalid', y: null });
  const malformedPan = project('Malformed pan', 2, { x: 'invalid', y: null });
  const outOfRange = project('Out of range framing', 20, { x: 1_000_000, y: -1_000_000 });
  const belowMinimum = project('Below minimum framing', -5, { x: 48, y: -30 });

  await page.addInitScript(({ storeKey, historyKey, active, history }) => {
    if (sessionStorage.getItem('cloudpainter-malformed-framing-test-seeded')) return;
    sessionStorage.setItem('cloudpainter-malformed-framing-test-seeded', '1');
    localStorage.setItem(storeKey, JSON.stringify(active));
    localStorage.setItem(historyKey, JSON.stringify(history));
  }, {
    storeKey: STORE_KEY,
    historyKey: PROJECT_HISTORY_KEY,
    active: malformedZoom,
    history: [malformedPan, outOfRange, belowMinimum],
  });
  await page.goto('./');

  const stageContent = page.locator('.stage-content');
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', photo);
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(1\)/);
  await expect(page.locator('canvas.draw-surface')).toBeVisible();
  await expect.poll(async () => {
    const savedProject = await saved(page);
    return { photoZoom: savedProject?.photoZoom, photoPan: savedProject?.photoPan };
  }).toEqual({ photoZoom: 1, photoPan: { x: 0, y: 0 } });

  await page.getByTestId('button-zoom-in').click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('125');
  const canvas = page.locator('canvas.draw-surface');
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.move(canvasBounds!.x + canvasBounds!.width * 0.35, canvasBounds!.y + canvasBounds!.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(canvasBounds!.x + canvasBounds!.width * 0.55, canvasBounds!.y + canvasBounds!.height * 0.55);
  await page.mouse.up();
  await expect.poll(async () => (await saved(page)).layers[0].strokes.length).toBe(1);

  await page.getByRole('button', { name: 'Restore saved sketch: Malformed pan' }).click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('200');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(2\)/);

  await page.getByRole('button', { name: 'Restore saved sketch: Out of range framing' }).click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('400');
  await expect.poll(async () => {
    const savedProject = await saved(page);
    return {
      photoZoom: savedProject?.photoZoom,
      photoPan: savedProject?.photoPan,
    };
  }).toMatchObject({ photoZoom: 4 });
  const normalizedPan = (await saved(page)).photoPan;
  expect(Number.isFinite(normalizedPan.x)).toBe(true);
  expect(Number.isFinite(normalizedPan.y)).toBe(true);
  expect(Math.abs(normalizedPan.x)).toBeLessThan(1_000_000);
  expect(Math.abs(normalizedPan.y)).toBeLessThan(1_000_000);
  await expect(page.getByTestId('button-pan-mode')).toBeEnabled();
  await expect(page.getByTestId('button-reset-photo-view')).toBeEnabled();
  await expect(page.locator('canvas.draw-surface')).toBeVisible();

  await page.getByRole('button', { name: 'Restore saved sketch: Below minimum framing' }).click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(1\)/);

  await page.getByTestId('button-zoom-in').click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('125');
});

test('legacy sketches open fitted, remain editable, and save current framing fields', async ({ page }) => {
  const photo = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const activeLayer = { id: 'legacy-active-layer', name: 'Active layer', visible: true, opacity: 1, strokes: [], redo: [] };
  const recoveryLayer = { id: 'legacy-recovery-layer', name: 'Recovery layer', visible: true, opacity: 1, strokes: [], redo: [] };
  const legacyActive = {
    image: photo,
    width: 320,
    height: 240,
    layers: [activeLayer],
    selectedLayerId: activeLayer.id,
    title: 'Legacy active sketch',
  };
  const legacyRecovery = {
    image: photo,
    width: 640,
    height: 480,
    layers: [recoveryLayer],
    selectedLayerId: recoveryLayer.id,
    title: 'Legacy recovery sketch',
  };
  await page.addInitScript(({ storeKey, historyKey, active, history }) => {
    if (sessionStorage.getItem('cloudpainter-legacy-framing-test-seeded')) return;
    sessionStorage.setItem('cloudpainter-legacy-framing-test-seeded', '1');
    localStorage.setItem(storeKey, JSON.stringify(active));
    localStorage.setItem(historyKey, JSON.stringify(history));
  }, {
    storeKey: STORE_KEY,
    historyKey: PROJECT_HISTORY_KEY,
    active: legacyActive,
    history: [legacyRecovery],
  });

  await page.goto('./');
  const stageContent = page.locator('.stage-content');
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(1\)/);

  await page.getByTestId('button-add-layer').click();
  await expect.poll(async () => {
    const project = await saved(page);
    return {
      title: project?.title,
      photoZoom: project?.photoZoom,
      photoPan: project?.photoPan,
      layerNames: project?.layers.map((layer: { name: string }) => layer.name),
    };
  }).toEqual({
    title: 'Legacy active sketch',
    photoZoom: 1,
    photoPan: { x: 0, y: 0 },
    layerNames: ['Active layer', 'Layer 2'],
  });

  await page.getByRole('button', { name: 'Restore saved sketch: Legacy recovery sketch' }).click();
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(stageContent).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(1\)/);

  await page.getByTestId('button-add-layer').click();
  await expect.poll(async () => {
    const project = await saved(page);
    return {
      title: project?.title,
      photoZoom: project?.photoZoom,
      photoPan: project?.photoPan,
      layerNames: project?.layers.map((layer: { name: string }) => layer.name),
    };
  }).toEqual({
    title: 'Legacy recovery sketch',
    photoZoom: 1,
    photoPan: { x: 0, y: 0 },
    layerNames: ['Recovery layer', 'Layer 2'],
  });
});

  const dialogPromise = page.waitForEvent('dialog');

  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    return canvas.toDataURL('image/png').split(',')[1];
  });

  const historyBeforeRestore = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), PROJECT_HISTORY_KEY);

  const acceptedDialogPromise = page.waitForEvent('dialog');

  const dialog = await dialogPromise;
