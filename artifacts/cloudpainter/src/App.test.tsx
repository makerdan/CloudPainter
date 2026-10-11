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

test('choosing the identical photo again handles change and saves a fresh fitted sketch', async ({ page }) => {
  const photo = await png(page, 'same-photo.png', 600, 400);
  const input = page.getByTestId('input-photo');
  await input.evaluate(element => {
    element.setAttribute('data-photo-changes', '0');
    element.addEventListener('change', () => {
      element.setAttribute('data-photo-changes', String(Number(element.getAttribute('data-photo-changes')) + 1));
    });
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('button-photo-card').click();
  await (await chooser).setFiles(photo);
  await expect(page.getByTestId('img-reference')).toBeVisible();
  await expect(input).toHaveAttribute('data-photo-changes', '1');
  // Automation can force change even for an unchanged file selection. Assert
  // the input was cleared as well, so removing handleFile's reset fails here.
  await expect(input).toHaveValue('');
  await expect.poll(async () => (await savedProject(page))?.title).toBe('same-photo');

  await page.getByTestId('button-add-layer').click();
  const box = await page.locator('canvas.draw-surface').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6);
  await page.mouse.up();
  await expect.poll(async () => (await savedProject(page))?.layers[1]?.strokes.length).toBe(1);
  await zoomAndPan(page);
  const before = await savedProject(page);
  expect(before.layers).toHaveLength(2);

  const replacement = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace reference photo', exact: true }).click();
  await (await replacement).setFiles(photo); // Same name, MIME type and bytes.
  await expect(input).toHaveAttribute('data-picker-clicks', '2');
  await expect(input).toHaveAttribute('data-photo-changes', '2');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('input-photo-zoom')).toHaveValue('100');
  await expect(page.getByTestId('button-pan-mode')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('button-reset-photo-view')).toBeDisabled();
  await expect.poll(() => photoPan(page)).toEqual({ x: 0, y: 0 });
  await expect.poll(async () => {
    const view = await photoView(page);
    return view.content;
  }).toEqual(await page.getByTestId('canvas-stage').boundingBox());
  await expect.poll(async () => {
    const project = await savedProject(page);
    return project && {
      image: project.image, width: project.width, height: project.height,
      title: project.title, layers: project.layers.map((layer: {
        name: string; visible: boolean; opacity: number; strokes: unknown[]; redo: unknown[];
      }) => ({
        name: layer.name, visible: layer.visible, opacity: layer.opacity,
        strokes: layer.strokes, redo: layer.redo,
      })),
      selected: project.selectedLayerId === project.layers[0]?.id,
    };
  }).toEqual({
    image: before.image, width: 600, height: 400, title: 'same-photo',
    layers: [{ name: 'Sketch layer', visible: true, opacity: 1, strokes: [], redo: [] }],
    selected: true,
  });
  const after = await savedProject(page);
  expect(before.layers.map((layer: { id: string }) => layer.id)).not.toContain(after.selectedLayerId);
  await expect(page.getByTestId('button-undo')).toBeDisabled();
  await expect(page.getByTestId('button-redo')).toBeDisabled();

  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', after.image);
  await expect.poll(() => savedProject(page)).toEqual(after);
  await expect(page.getByTestId('button-undo')).toBeDisabled();
  await expect(page.getByTestId('button-redo')).toBeDisabled();
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

  // Populate both layers through the drawing UI so removal cannot silently
  // clear artwork while leaving an otherwise plausible empty project behind.
  const firstLayerId = (await savedProject(page)).selectedLayerId;
  for (let index = 0; index < 2; index++) {
    if (index === 1) await page.getByTestId('button-add-layer').click();
  const surface = page.locator('canvas.draw-surface');
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * (0.3 + index * 0.3));
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * (0.4 + index * 0.3));
    await page.mouse.up();
    await expect.poll(async () => (await savedProject(page))?.layers[index]?.strokes.length).toBe(1);
  }
  const secondLayerId = (await savedProject(page)).selectedLayerId;
  await page.getByTestId(`button-rename-${secondLayerId}`).click();
  await page.getByTestId(`input-rename-${secondLayerId}`).fill('Hidden details');
  await page.getByTestId(`input-rename-${secondLayerId}`).press('Enter');
  await page.getByTestId('disclosure-opacity').click();
  await page.getByTestId('input-layer-opacity').fill('45');
  await page.getByTestId(`button-visibility-${secondLayerId}`).click();
  // Select the older layer rather than the default newly-created top layer.
  await page.getByTestId(`button-select-layer-${firstLayerId}`).click();
  await expect.poll(async () => {
    const project = await savedProject(page);
    return project && {
      selectedLayerId: project.selectedLayerId,
      layers: project.layers.map((layer: { name: string; visible: boolean; opacity: number; strokes: unknown[] }) => ({
        name: layer.name, visible: layer.visible, opacity: layer.opacity, strokes: layer.strokes.length,
      })),
    };
  }).toEqual({
    selectedLayerId: firstLayerId,
    layers: [
      { name: 'Sketch layer', visible: true, opacity: 1, strokes: 1 },
      { name: 'Hidden details', visible: false, opacity: 0.45, strokes: 1 },
    ],
  });
  const before = await savedProject(page);
  expect(before).toMatchObject({ width: 320, height: 180, title: 'remove-me' });
  expect(before.image).not.toBeNull();
  expect(await remove.evaluate(el => el.parentElement?.closest('button'))).toBeNull();
  await remove.click();
  await expect(page.getByTestId('img-reference')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import a reference photo', exact: true })).toBeVisible();
  await expect(page.getByTestId('input-photo')).toHaveAttribute('data-picker-clicks', '1');
  // Full equality covers stroke points/styles, layer IDs/order/properties and
  // history, selected layer, canvas dimensions, and title.
  await expect.poll(() => savedProject(page)).toEqual({ ...before, image: null });
  await expect(page.getByTestId(`layer-row-${firstLayerId}`)).toHaveClass(/active/);

  await page.reload();
  await expect(page.getByTestId('img-reference')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import a reference photo', exact: true })).toBeVisible();
  await expect(remove).toHaveCount(0);
  await expect(page.getByTestId(`layer-row-${firstLayerId}`)).toHaveClass(/active/);
  await expect(page.getByTestId(`button-visibility-${secondLayerId}`)).toHaveAttribute('aria-label', 'Show layer');
  expect(await savedProject(page)).toEqual({ ...before, image: null });
});

for (const action of ['undo', 'redo'] as const) {
  test(`${action} follows the selected layer's independent history and persists after reload`, async ({ page }) => {
    const photo = await png(page, 'independent-histories.png', 480, 320);
    const stroke = (color: string, y: number) => ({
      points: [{ x: 0.2, y }, { x: 0.7, y }],
      color, size: 8, tool: 'pen',
    });
    const before = {
      image: `data:image/png;base64,${photo.buffer.toString('base64')}`,
      width: 480, height: 320, title: 'Independent drawing histories',
      selectedLayerId: 'history-bottom',
      layers: [
        { id: 'history-bottom', name: 'Background', visible: true, opacity: 0.65,
          strokes: [stroke('#e53935', 0.2)], redo: [stroke('#ff9800', 0.25)] },
        { id: 'history-middle', name: 'Main drawing', visible: true, opacity: 0.45,
          strokes: [stroke('#1e88e5', 0.4), stroke('#8e24aa', 0.45)],
          redo: [stroke('#00acc1', 0.5), stroke('#d81b60', 0.55)] },
        { id: 'history-top', name: 'Hidden details', visible: false, opacity: 0.8,
          strokes: [stroke('#43a047', 0.65)], redo: [stroke('#3949ab', 0.7), stroke('#6d4c41', 0.75)] },
      ],
    };
    // Seed once before mount; subsequent reloads must use real autosaved results.
    await page.addInitScript(({ key, project }) => {
      const marker = `${key}-history-test-seeded`;
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem(key, JSON.stringify(project));
      sessionStorage.setItem(marker, 'true');
    }, { key: STORE_KEY, project: before });
    await page.reload();
    await expect(page.getByTestId('img-reference')).toBeVisible();
    await expect.poll(() => savedProject(page)).toEqual(before);

    let expected = before;
    const assertProject = async () => {
      // Full equality protects photo, dimensions, title, selection, ordering,
      // layer properties, and every stroke and redo entry, not just counts.
      await expect.poll(() => savedProject(page)).toEqual(expected);
      await expect(page.getByTestId(`layer-row-${expected.selectedLayerId}`)).toHaveClass(/active/);
      await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
      const selected = expected.layers.find(layer => layer.id === expected.selectedLayerId)!;
      await expect(page.getByTestId('button-undo')).toBeEnabled({ enabled: selected.strokes.length > 0 });
      await expect(page.getByTestId('button-redo')).toBeEnabled({ enabled: selected.redo.length > 0 });
    };
    const selectLayer = async (layerId: string) => {
      await page.getByTestId(`button-select-layer-${layerId}`).click();
      expected = { ...expected, selectedLayerId: layerId };
      await assertProject();
    };
    const applyHistory = async (operation: 'undo' | 'redo') => {
      await page.getByTestId(`button-${operation}`).click();
      expected = {
        ...expected,
        layers: expected.layers.map(layer => {
          if (layer.id !== expected.selectedLayerId) return layer;
          return operation === 'undo'
            ? { ...layer, strokes: layer.strokes.slice(0, -1),
              redo: [...layer.redo, layer.strokes[layer.strokes.length - 1]] }
            : { ...layer, strokes: [...layer.strokes, layer.redo[layer.redo.length - 1]],
              redo: layer.redo.slice(0, -1) };
        }),
      };
      await assertProject();
    };

    // Alternate middle, bottom and top selection to catch stale selection,
    // first/last-layer targeting, shared stacks, and incorrect stack order.
    for (const layerId of ['history-middle', 'history-bottom', 'history-top', 'history-middle']) {
      await selectLayer(layerId);
      await applyHistory(action);
    }
    // Two operations exhaust the middle layer's relevant stack. Other layers
    // still have independent undo/redo availability.
    await expect(page.getByTestId(`button-${action}`)).toBeDisabled();
    await page.reload();
    await expect(page.getByTestId('img-reference')).toBeVisible();
    await assertProject();

    // Restored history must remain usable, not merely serialized correctly.
    await applyHistory(action === 'undo' ? 'redo' : 'undo');
    await selectLayer('history-bottom');
    await applyHistory(action === 'undo' ? 'redo' : 'undo');
    await page.reload();
    await expect(page.getByTestId('img-reference')).toBeVisible();
    await assertProject();
  });
}

for (const action of ['undo', 'redo'] as const) {
  test(`${action} survives an immediate reload before debounced autosave`, async ({ page }) => {
    const photo = await png(page, 'immediate-history.png', 480, 320);
    const stroke = (color: string, y: number) => ({
      points: [{ x: 0.2, y }, { x: 0.7, y }],
      color, size: 8, tool: 'pen',
    });
    const before = {
      image: `data:image/png;base64,${photo.buffer.toString('base64')}`,
      width: 480, height: 320, title: 'Immediate history reload',
      selectedLayerId: 'immediate-middle',
      layers: [
        { id: 'immediate-bottom', name: 'Background', visible: true, opacity: 0.65,
          strokes: [stroke('#e53935', 0.2)], redo: [stroke('#ff9800', 0.25)] },
        { id: 'immediate-middle', name: 'Main drawing', visible: true, opacity: 0.45,
          strokes: [stroke('#1e88e5', 0.4), stroke('#8e24aa', 0.45)],
          redo: [stroke('#00acc1', 0.5), stroke('#d81b60', 0.55)] },
        { id: 'immediate-top', name: 'Hidden details', visible: false, opacity: 0.8,
          strokes: [stroke('#43a047', 0.65)],
          redo: [stroke('#3949ab', 0.7), stroke('#6d4c41', 0.75)] },
      ],
    };
    await page.addInitScript(({ key, project }) => {
      const marker = `${key}-immediate-history-seeded`;
      if (sessionStorage.getItem(marker)) return;
      localStorage.setItem(key, JSON.stringify(project));
      sessionStorage.setItem(marker, 'true');
    }, { key: STORE_KEY, project: before });
    await page.reload();
    await expect(page.getByTestId('img-reference')).toBeVisible();
    await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
    // Settle initial mount only. Never wait for persistence after the action.
    await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible();
    expect(await savedProject(page)).toEqual(before);

    const expected = {
      ...before,
      layers: before.layers.map(layer => {
        if (layer.id !== before.selectedLayerId) return layer;
        return action === 'undo'
          ? { ...layer, strokes: layer.strokes.slice(0, -1),
            redo: [...layer.redo, layer.strokes[layer.strokes.length - 1]] }
          : { ...layer, strokes: [...layer.strokes, layer.redo[layer.redo.length - 1]],
            redo: layer.redo.slice(0, -1) };
      }),
    };
    // Freeze time so even a slow test runner cannot accidentally let the
    // 500ms debounce save first and mask a broken pagehide flush.
    const frozenTime = new Date('2026-10-11T12:00:00Z');
    await page.clock.install({ time: frozenTime });
    await page.clock.pauseAt(frozenTime);
    await page.getByTestId(`button-${action}`).click();
    await page.reload();

    // Read immediately: polling here could hide a missing unload save behind
    // the next mount's autosave. Whole-project equality checks both stack
    // orders, the selected layer, and all untouched layers and photo data.
    expect(await savedProject(page)).toEqual(expected);
    await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
    await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
    await expect(page.getByTestId('button-undo')).toBeEnabled();
    await expect(page.getByTestId('button-redo')).toBeEnabled();

    // Verify the rehydrated stack is usable: the inverse action must restore
    // every original entry, including the pre-existing redo history.
    await page.getByTestId(`button-${action === 'undo' ? 'redo' : 'undo'}`).click();
    await page.reload();
    expect(await savedProject(page)).toEqual(before);
    await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
  });
}

for (const redoOnly of [false, true]) {
test(`Clear selected layer clears only its ${redoOnly ? 'redo-only history, remains safe when already empty,' : 'strokes and redo history'} and persists after reload`, async ({ page }) => {
  const photo = await png(page, 'clear-layer-reference.png', 480, 320);
  const stroke = (color: string, y: number) => ({
    points: [{ x: 0.2, y }, { x: 0.7, y }],
    color, size: 8, tool: 'pen',
  });
  // Select the middle layer; protect both neighbors' artwork and history.
  const before = {
    image: `data:image/png;base64,${photo.buffer.toString('base64')}`,
    width: 480, height: 320, title: 'Keep the rest of my sketch',
    selectedLayerId: 'layer-clear-target',
    layers: [
      { id: 'layer-keep-bottom', name: 'Background lines', visible: true, opacity: 0.65,
        strokes: [stroke('#e53935', 0.25)], redo: [stroke('#ff9800', 0.3)] },
      { id: 'layer-clear-target', name: 'Draft to clear', visible: true, opacity: 0.45,
        strokes: redoOnly ? [] : [stroke('#1e88e5', 0.5), stroke('#8e24aa', 0.55)], redo: [stroke('#00acc1', 0.6)] },
      { id: 'layer-keep-top', name: 'Hidden details', visible: false, opacity: 0.8,
        strokes: [stroke('#43a047', 0.75)], redo: [stroke('#3949ab', 0.8)] },
    ],
  };
  // Seed before React mounts, after the previous page's unload save. Seed
  // only once so the final reload reads the app's actual persisted result.
  await page.addInitScript(({ key, project }) => {
    const seededKey = `${key}-clear-test-seeded`;
    if (sessionStorage.getItem(seededKey)) return;
    localStorage.setItem(key, JSON.stringify(project));
    sessionStorage.setItem(seededKey, 'true');
  }, { key: STORE_KEY, project: before });
  await page.reload();
  await expect(page.getByTestId('img-reference')).toBeVisible();
  await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
  if (redoOnly) await expect(page.getByTestId('button-undo')).toBeDisabled();
  else await expect(page.getByTestId('button-undo')).toBeEnabled();
  await expect(page.getByTestId('button-redo')).toBeEnabled();
  await expect.poll(() => savedProject(page)).toEqual(before);

  const after = {
    ...before,
    layers: before.layers.map(layer => layer.id === before.selectedLayerId
      ? { ...layer, strokes: [], redo: [] }
      : layer),
  };
  await page.getByRole('button', { name: 'Clear selected layer', exact: true }).click();
  // Full equality guards all untouched layer properties and histories, the
  // photo bytes, dimensions, title, layer ordering, and selected layer ID.
  await expect.poll(() => savedProject(page)).toEqual(after);
  await expect(page.getByTestId('button-undo')).toBeDisabled();
  await expect(page.getByTestId('button-redo')).toBeDisabled();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
  await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);

  await page.reload();
  await expect(page.getByTestId('img-reference')).toBeVisible();
  await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
  await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
  await expect(page.getByTestId('button-undo')).toBeDisabled();
  await expect(page.getByTestId('button-redo')).toBeDisabled();
  await expect(page.getByTestId('button-visibility-layer-keep-top')).toHaveAttribute('aria-label', 'Show layer');
  await expect.poll(() => savedProject(page)).toEqual(after);

  if (redoOnly) {
    // Clear again after rehydrating the now completely empty target. Neither
    // this no-op nor another reload may change the remaining saved project.
    await page.getByRole('button', { name: 'Clear selected layer', exact: true }).click();
    await expect(page.getByTestId('button-undo')).toBeDisabled();
    await expect(page.getByTestId('button-redo')).toBeDisabled();
    await expect.poll(() => savedProject(page)).toEqual(after);
    await page.reload();
    await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
    await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
    await expect(page.getByTestId('button-undo')).toBeDisabled();
    await expect(page.getByTestId('button-redo')).toBeDisabled();
    await expect.poll(() => savedProject(page)).toEqual(after);
  }
});
}

for (const deleteSelected of [true, false]) {
  test(`deleting ${deleteSelected ? 'a selected' : 'an unselected'} layer preserves the other artwork and survives reload`, async ({ page }) => {
    await page.getByTestId('input-photo').setInputFiles(await png(page, 'layer-deletion.png', 320, 180));
    await expect(page.getByTestId('img-reference')).toBeVisible();
    await expect.poll(async () => (await savedProject(page))?.title).toBe('layer-deletion');
    await page.getByTestId('disclosure-opacity').click();

    // Build independent, non-empty layers using real controls, including undo
    // history and different properties so broad resets cannot pass unnoticed.
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    if (index) await page.getByTestId('button-add-layer').click();
  const surface = page.locator('canvas.draw-surface');
    const id = (await surface.getAttribute('data-testid'))!.replace('canvas-layer-', '');
    ids.push(id);
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
      for (let stroke = 0; stroke < 2; stroke++) {
        await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height * (0.2 + index * 0.2 + stroke * 0.05));
        await page.mouse.down();
        await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * (0.25 + index * 0.2 + stroke * 0.05), { steps: 4 });
        await page.mouse.up();
        await expect.poll(async () => (await savedProject(page))?.layers[index]?.strokes.length).toBe(stroke + 1);
      }
      await page.getByTestId('button-undo').click();
      await page.getByTestId(`button-rename-${id}`).click();
      await page.getByTestId(`input-rename-${id}`).fill(`Preserved details ${index + 1}`);
      await page.getByTestId(`input-rename-${id}`).press('Enter');
      await page.getByTestId('input-layer-opacity').fill(String(40 + index * 20));
    }
    await page.getByTestId(`button-visibility-${ids[2]}`).click();
    await page.getByTestId(`button-select-layer-${deleteSelected ? ids[1] : ids[0]}`).click();
    await expect.poll(async () => {
      const project = await savedProject(page);
      return {
        selected: project?.selectedLayerId,
        layers: project?.layers.map((layer: { name: string; visible: boolean; opacity: number; strokes: unknown[]; redo: unknown[] }) => ({
          name: layer.name, visible: layer.visible, opacity: layer.opacity,
          strokes: layer.strokes.length, redo: layer.redo.length,
        })),
      };
    }).toEqual({
      selected: deleteSelected ? ids[1] : ids[0],
      layers: ids.map((_, index) => ({
        name: `Preserved details ${index + 1}`, visible: index !== 2,
        opacity: (40 + index * 20) / 100, strokes: 1, redo: 1,
      })),
    });
    const before = await savedProject(page);
    expect(before.image).toMatch(/^data:image\/png/);
    const pixels = await Promise.all(ids.map(id =>
      page.getByTestId(`canvas-layer-${id}`).evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL()),
    ));
    const expected = {
      ...before,
      layers: [before.layers[0], before.layers[2]],
      selectedLayerId: deleteSelected ? ids[2] : ids[0],
    };
    await page.getByTestId(`button-delete-layer-${ids[1]}`).click();
    await expect.poll(() => savedProject(page)).toEqual(expected);
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await expect(page.locator('.layer-row')).toHaveCount(2);
      await expect(page.getByTestId(`layer-row-${ids[1]}`)).toHaveCount(0);
      await expect(page.getByTestId(`canvas-layer-${ids[1]}`)).toHaveCount(0);
      await expect(page.getByTestId(`layer-row-${expected.selectedLayerId}`)).toHaveClass(/active/);
      expect(expected.layers.map((layer: { id: string }) => layer.id)).toContain(expected.selectedLayerId);
      await expect(page.getByTestId('input-layer-opacity')).toHaveValue(deleteSelected ? '80' : '40');
      await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
      await expect(page.getByTestId(`button-visibility-${ids[2]}`)).toHaveAttribute('aria-label', 'Show layer');
      for (const index of [0, 2]) {
        const canvas = page.getByTestId(`canvas-layer-${ids[index]}`);
        await expect(page.getByTestId(`layer-row-${ids[index]}`)).toContainText(before.layers[index].name);
        await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(pixels[index]);
        await expect(canvas).toHaveCSS('opacity', index === 2 ? '0' : '0.4');
      }
      await expect.poll(() => savedProject(page)).toEqual(expected);
    }

    // Removing the other survivor leaves a populated sole layer. Its delete
    // control must reject the action, rather than create an empty project.
    await page.getByTestId(`button-delete-layer-${ids[2]}`).click();
    const soleLayer = { ...expected, layers: [before.layers[0]], selectedLayerId: ids[0] };
    await expect.poll(() => savedProject(page)).toEqual(soleLayer);
    await page.getByTestId(`button-delete-layer-${ids[0]}`).click();
    await expect(page.getByTestId('status-toast')).toContainText('Keep at least one drawing layer in your project.');
    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.getByTestId(`layer-row-${ids[0]}`)).toHaveClass(/active/);
    await page.waitForTimeout(650); // Observe any erroneous debounced save.
    expect(await savedProject(page)).toEqual(soleLayer);
    await page.reload();
    await expect(page.locator('.layer-row')).toHaveCount(1);
    await expect(page.getByTestId(`layer-row-${ids[0]}`)).toHaveClass(/active/);
    await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
    expect(await savedProject(page)).toEqual(soleLayer);
  });
}

test('layer moves preserve selection, artwork, properties and history across reload', async ({ page }) => {
  const photo = await png(page, 'layer-order.png', 480, 320);
  const ids = ['order-bottom', 'order-middle', 'order-top'];
  const before = {
    image: `data:image/png;base64,${photo.buffer.toString('base64')}`,
    width: 480, height: 320, title: 'Layer ordering', selectedLayerId: ids[1],
    layers: ids.map((id, index) => ({
      id, name: `Order details ${index + 1}`, visible: index !== 2,
      opacity: (40 + index * 20) / 100,
      strokes: [{ tool: 'pen', color: ['#e53935', '#1e88e5', '#43a047'][index], size: 8,
        points: [{ x: 0.2, y: 0.2 + index * 0.2 }, { x: 0.7, y: 0.2 + index * 0.2 }] }],
      redo: [{ tool: 'pen', color: '#ff9800', size: 6,
        points: [{ x: 0.3, y: 0.3 + index * 0.2 }] }],
    })),
  };
  await page.addInitScript(({ key, project }) => {
    const marker = `${key}-order-test-seeded`;
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem(key, JSON.stringify(project));
    sessionStorage.setItem(marker, 'true');
  }, { key: STORE_KEY, project: before });
  await page.reload();
  await expect.poll(() => savedProject(page)).toEqual(before);
  const pixels = await Promise.all(ids.map(id => page.getByTestId(`canvas-layer-${id}`)
    .evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())));
  const assertOrder = async (order: number[]) => {
    await expect.poll(() => savedProject(page)).toEqual({ ...before, layers: order.map(index => before.layers[index]) });
    await expect.poll(() => page.locator('.layer-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-testid'))))
      .toEqual([...order].reverse().map(index => `layer-row-${ids[index]}`));
    await expect(page.getByTestId(`layer-row-${ids[1]}`)).toHaveClass(/active/);
    await expect(page.getByTestId('button-undo')).toBeEnabled();
    await expect(page.getByTestId('button-redo')).toBeEnabled();
    await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
    for (const [index, id] of ids.entries()) {
      const canvas = page.getByTestId(`canvas-layer-${id}`);
      await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(pixels[index]);
      await expect(canvas).toHaveCSS('opacity', String(index === 2 ? 0 : before.layers[index].opacity));
      await expect(page.getByTestId(`button-select-layer-${id}`)).toHaveText(before.layers[index].name);
    }
    await expect(page.getByTestId(`button-layer-up-${ids[order[2]]}`)).toBeDisabled();
    await expect(page.getByTestId(`button-layer-down-${ids[order[0]]}`)).toBeDisabled();
  };
  await assertOrder([0, 1, 2]);
  for (const [index, direction, order] of [
    [1, 'up', [0, 2, 1]], [1, 'down', [0, 1, 2]],
    [0, 'up', [1, 0, 2]], [2, 'down', [1, 2, 0]],
    [0, 'down', [1, 0, 2]], [1, 'up', [0, 1, 2]],
  ] as const) {
    await page.getByTestId(`button-layer-${direction}-${ids[index]}`).click();
    await assertOrder([...order]);
  }
  for (const [direction, index] of [['up', 2], ['down', 0]] as const) {
    await page.getByTestId(`button-layer-${direction}-${ids[index]}`).evaluate(node => (node as HTMLButtonElement).click());
  }
  await page.waitForTimeout(650);
  await assertOrder([0, 1, 2]);
  await page.reload();
  await assertOrder([0, 1, 2]);
});

test.describe('layer rename regression', () => {
  for (const [firstTarget, secondAction] of [
    ['selected', 'Enter'], ['unselected', 'Enter'],
    ['selected', 'Escape'], ['unselected', 'Escape'],
  ] as const) {
    const outcome = secondAction === 'Escape'
      ? 'cancels the second draft without undoing the first saved name'
      : 'commits each draft to its own ID';
    test(`switching rename fields from ${firstTarget} layer ${outcome} and survives reload`, async ({ page }) => {
      const photo = await png(page, 'rename-switch-reference.png', 480, 320);
      const ids = ['switch-bottom', 'switch-middle', 'switch-top'];
      const before = {
        image: `data:image/png;base64,${photo.buffer.toString('base64')}`,
        width: 480, height: 320, title: 'Independent rename drafts', selectedLayerId: ids[1],
        layers: ids.map((id, index) => ({
          id, name: ['Background lines', 'Selected details', 'Hidden highlights'][index],
          visible: index !== 2, opacity: (40 + index * 20) / 100,
          strokes: [{ tool: 'pen', color: ['#e53935', '#1e88e5', '#43a047'][index], size: 8,
            points: [{ x: 0.2, y: 0.25 + index * 0.2 }, { x: 0.7, y: 0.25 + index * 0.2 }] }],
          redo: [{ tool: 'pen', color: '#ff9800', size: 6,
            points: [{ x: 0.3, y: 0.3 + index * 0.2 }] }],
        })),
      };
      // Seed once: reloading below must read actual autosaved names, not the fixture.
      await page.addInitScript(({ key, project }) => {
        const marker = `${key}-rename-switch-seeded`;
        if (sessionStorage.getItem(marker)) return;
        localStorage.setItem(key, JSON.stringify(project));
        sessionStorage.setItem(marker, 'true');
      }, { key: STORE_KEY, project: before });
      await page.reload();
      await expect(page.getByTestId('img-reference')).toBeVisible();
      await expect.poll(() => savedProject(page)).toEqual(before);
      const pixels = await Promise.all(ids.map(async id => {
        const canvas = page.getByTestId(`canvas-layer-${id}`);
        await expect.poll(() => canvas.evaluate(el => {
          const surface = el as HTMLCanvasElement;
          const rgba = surface.getContext('2d')!.getImageData(0, 0, surface.width, surface.height).data;
          return rgba.some((value, index) => index % 4 === 3 && value > 0);
        })).toBe(true);
        return canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
      }));
      const firstId = firstTarget === 'selected' ? ids[1] : ids[2];
      const secondId = firstTarget === 'selected' ? ids[2] : ids[1];
      const firstInput = page.getByTestId(`input-rename-${firstId}`);
      const secondInput = page.getByTestId(`input-rename-${secondId}`);
      const assertIntact = async () => {
        await expect(page.locator('.layer-row')).toHaveCount(3);
        await expect(page.locator('.layer-row.active')).toHaveCount(1);
        await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
        await expect(page.getByTestId('input-layer-opacity')).toHaveValue('60');
        await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
        await expect(page.getByTestId('button-undo')).toBeEnabled();
        await expect(page.getByTestId('button-redo')).toBeEnabled();
        for (const [index, layer] of before.layers.entries()) {
          await expect(page.getByTestId(`button-visibility-${layer.id}`)).toHaveAttribute(
            'aria-label', layer.visible ? 'Hide layer' : 'Show layer',
          );
          const canvas = page.getByTestId(`canvas-layer-${layer.id}`);
          await expect(canvas).toHaveCSS('opacity', String(layer.visible ? layer.opacity : 0));
          await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(pixels[index]);
        }
      };
      await page.getByTestId(`button-rename-${firstId}`).click();
      await expect(firstInput).toBeFocused();
      await expect(firstInput).toHaveValue(before.layers.find(layer => layer.id === firstId)!.name);
      await firstInput.fill('  First committed draft  ');
      await page.waitForTimeout(650); // Drafts must not autosave before a commit.
      expect(await savedProject(page)).toEqual(before);

      // One real pointer click must blur/commit the first input AND open the
      // second. Do not simulate blur separately or commit via Enter first.
      await page.getByTestId(`button-rename-${secondId}`).click();
      await expect(firstInput).toHaveCount(0);
      await expect(page.locator('.rename-input')).toHaveCount(1);
      await expect(secondInput).toBeFocused();
      await expect(secondInput).toHaveValue(before.layers.find(layer => layer.id === secondId)!.name);
      const firstCommitted = {
        ...before,
        layers: before.layers.map(layer => layer.id === firstId ? { ...layer, name: 'First committed draft' } : layer),
      };
      await expect(page.getByTestId(`button-select-layer-${firstId}`)).toHaveText('First committed draft');
      await expect.poll(() => savedProject(page)).toEqual(firstCommitted);
      await assertIntact();

      await secondInput.fill(secondAction === 'Escape' ? '  Cancelled second draft  ' : '  Second committed draft  ');
      await page.waitForTimeout(650);
      expect(await savedProject(page)).toEqual(firstCommitted);
      await secondInput.press(secondAction);
      await expect(secondInput).toHaveCount(0);
      const expected = {
        ...firstCommitted,
        layers: firstCommitted.layers.map(layer => layer.id === secondId && secondAction === 'Enter'
          ? { ...layer, name: 'Second committed draft' }
          : layer),
      };
      // Cancellation must not schedule a delayed save of either the discarded
      // second draft or the stale project from before the first blur commit.
      if (secondAction === 'Escape') await page.waitForTimeout(650);
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect(page.locator('.rename-input')).toHaveCount(0);
        for (const layer of expected.layers) {
          await expect(page.getByTestId(`button-select-layer-${layer.id}`)).toHaveText(layer.name);
        }
        await assertIntact();
        // Full equality guards IDs/order, histories, photo and all other data.
        await expect.poll(() => savedProject(page)).toEqual(expected);
      }
    });
  }

  for (const target of ['selected', 'unselected'] as const) {
    for (const action of ['Enter', 'blur', 'Escape', 'empty', 'whitespace'] as const) {
      test(`${target} layer: ${action} preserves selection and artwork after reload`, async ({ page }) => {
        const photo = await png(page, 'rename-reference.png', 480, 320);
        const stroke = (color: string, y: number) => ({
          points: [{ x: 0.2, y }, { x: 0.7, y }],
          color, size: 8, tool: 'pen',
        });

        // Independent fixture: each layer has distinct artwork, redo history,
        // opacity and a stable ID. The unselected target is deliberately hidden.
        const before = {
          image: `data:image/png;base64,${photo.buffer.toString('base64')}`,
          width: 480, height: 320, title: 'Preserve my named sketch',
          selectedLayerId: 'rename-middle',
          layers: [
            { id: 'rename-bottom', name: 'Background lines', visible: true, opacity: 0.65,
              strokes: [stroke('#e53935', 0.25)], redo: [stroke('#ff9800', 0.3)] },
            { id: 'rename-middle', name: 'Selected details', visible: true, opacity: 0.45,
              strokes: [stroke('#1e88e5', 0.5), stroke('#8e24aa', 0.55)], redo: [stroke('#00acc1', 0.6)] },
            { id: 'rename-top', name: 'Hidden highlights', visible: false, opacity: 0.8,
              strokes: [stroke('#43a047', 0.75)], redo: [stroke('#3949ab', 0.8)] },
          ],
        };
        // Seed only the first load; later reloads must use the app's saved state.
        await page.addInitScript(({ key, project }) => {
          const marker = `${key}-rename-test-seeded`;
          if (sessionStorage.getItem(marker)) return;
          localStorage.setItem(key, JSON.stringify(project));
          sessionStorage.setItem(marker, 'true');
        }, { key: STORE_KEY, project: before });
        await page.reload();
        await expect(page.getByTestId('img-reference')).toBeVisible();
        await expect.poll(() => savedProject(page)).toEqual(before);

        const pixels = await Promise.all(before.layers.map(async layer => {
          const canvas = page.getByTestId(`canvas-layer-${layer.id}`);
          // A blank canvas comparison must not masquerade as preserved artwork.
          await expect.poll(() => canvas.evaluate(el => {
            const surface = el as HTMLCanvasElement;
            const rgba = surface.getContext('2d')!.getImageData(0, 0, surface.width, surface.height).data;
            return rgba.some((value, index) => index % 4 === 3 && value > 0);
          })).toBe(true);
          return canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
        }));
        const id = target === 'selected' ? 'rename-middle' : 'rename-top';
        const original = before.layers.find(layer => layer.id === id)!;
        const input = page.getByTestId(`input-rename-${id}`);
        await page.getByTestId(`button-rename-${id}`).click();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(original.name);
        const draft = action === 'empty' ? '' : action === 'whitespace' ? '   ' : '  Renamed details  ';
        await input.fill(draft);

        // Editing is not a commit and must not select an unselected layer.
        expect(await savedProject(page)).toEqual(before);
        await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
        if (action === 'blur' || action === 'whitespace') {
          // Move real keyboard focus without invoking another project action.
          await input.press('Tab');
        } else {
          await input.press(action === 'Escape' ? 'Escape' : 'Enter');
        }
        await expect(input).toHaveCount(0);
        const committed = action === 'Enter' || action === 'blur';
        const expected = {
          ...before,
          layers: before.layers.map(layer => layer.id === id && committed
            ? { ...layer, name: 'Renamed details' }
            : layer),
        };
        // Observe the debounce even for no-op/cancel paths; immediate equality
        // alone could miss an erroneous delayed save.
        await page.waitForTimeout(650);
        for (const reload of [false, true]) {
          if (reload) await page.reload();
          await expect(page.locator('.layer-row')).toHaveCount(3);
          await expect(page.locator('.layer-row.active')).toHaveCount(1);
          await expect(page.getByTestId(`layer-row-${before.selectedLayerId}`)).toHaveClass(/active/);
          await expect(page.getByTestId('img-reference')).toHaveAttribute('src', before.image);
          await expect(page.getByTestId('button-undo')).toBeEnabled();
          await expect(page.getByTestId('button-redo')).toBeEnabled();
          for (const [index, layer] of expected.layers.entries()) {
            await expect(page.getByTestId(`button-select-layer-${layer.id}`)).toHaveText(layer.name);
            await expect(page.getByTestId(`button-visibility-${layer.id}`)).toHaveAttribute(
              'aria-label', layer.visible ? 'Hide layer' : 'Show layer',
            );
            const canvas = page.getByTestId(`canvas-layer-${layer.id}`);
            await expect(canvas).toHaveCSS('opacity', String(layer.visible ? layer.opacity : 0));
            await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).toBe(pixels[index]);
          }
          // Full equality protects IDs, ordering, selection, all properties,
          // strokes and redo data, dimensions, title and photo bytes.
          await expect.poll(() => savedProject(page)).toEqual(expected);
        }
      });
    }
  }
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

test('undo and redo preserve the zoomed and panned photo while moving the exact stroke between histories', async ({ page }) => {
  await page.getByTestId('input-photo').setInputFiles(await png(page, 'undo-redo-view.png', 600, 400));
  const preview = page.getByTestId('img-reference');
  await expect(preview).toBeVisible();
  const surface = page.locator('canvas.draw-surface');
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6, { steps: 8 });
  await page.mouse.up();
  // Wait for the debounced save before establishing history and view baselines.
  await expect.poll(async () => (await savedProject(page))?.layers[0]?.strokes.length).toBe(1);
  const before = await savedProject(page);
  expect(before.layers[0].redo).toEqual([]);
  expect(before.layers[0].strokes[0].points.length).toBeGreaterThan(1);

  await zoomAndPan(page);
  await page.getByTestId('button-pan-mode').click();
  const viewBefore = await photoView(page);
  expect(viewBefore.content!.width / viewBefore.stage!.width).toBeCloseTo(1.5, 2);
  const renderedPhoto = page.locator('.base-photo');
  const photoBefore = {
    src: await renderedPhoto.getAttribute('src'),
    bounds: await renderedPhoto.boundingBox(),
  };
  expect(photoBefore.src).toBe(before.image);

  const assertViewUnchanged = async () => {
    await expect(page.getByTestId('input-photo-zoom')).toHaveValue('150');
    await expect(page.getByTestId('button-pan-mode')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('button-reset-photo-view')).toBeEnabled();
    await expect(preview).toHaveAttribute('src', before.image);
    await expect(renderedPhoto).toHaveAttribute('src', photoBefore.src!);
    expect(await photoView(page)).toEqual(viewBefore);
    expect(await renderedPhoto.boundingBox()).toEqual(photoBefore.bounds);
  };
  // Inspect the rendered stroke as well as storage: stale canvases must not pass.
  const strokePixel = () => surface.evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    return Array.from(element.getContext('2d')!.getImageData(
      Math.round(element.width * 0.5), Math.round(element.height * 0.5), 1, 1,
    ).data);
  });
  const pixelBefore = await strokePixel();
  expect(pixelBefore[3]).toBeGreaterThan(0);

  await expect(page.getByTestId('button-undo')).toBeEnabled();
  await expect(page.getByTestId('button-redo')).toBeDisabled();
  await page.getByTestId('button-undo').click();
  await expect.poll(() => savedProject(page)).toEqual({
    ...before,
    layers: before.layers.map((layer: unknown, index: number) => index === 0
      ? { ...before.layers[0], strokes: [], redo: before.layers[0].strokes }
      : layer),
  });
  await expect(page.getByTestId('button-undo')).toBeDisabled();
  await expect(page.getByTestId('button-redo')).toBeEnabled();
  await expect.poll(strokePixel).toEqual([0, 0, 0, 0]);
  await assertViewUnchanged();

  await page.getByTestId('button-redo').click();
  await expect.poll(() => savedProject(page)).toEqual(before);
  await expect(page.getByTestId('button-undo')).toBeEnabled();
  await expect(page.getByTestId('button-redo')).toBeDisabled();
  await expect.poll(strokePixel).toEqual(pixelBefore);
  await assertViewUnchanged();
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
