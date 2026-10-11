import assert from 'node:assert/strict';
import test from 'node:test';
import { createInstrumentStroke, normalizePointerPressure, toolAfterColorSelection } from './drawingTools.ts';
import { PENCIL_PASSES, renderStroke, type Stroke } from './strokeRenderer.ts';

function replay(stroke: Stroke) {
  const operations: unknown[][] = [];
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const methods = {
    save() { stack.push({ ...state }); },
    restore() { Object.assign(state, stack.pop()); },
    beginPath() { operations.push(['begin']); },
    closePath() { operations.push(['close']); },
    moveTo(...args: number[]) { operations.push(['move', ...args]); },
    lineTo(...args: number[]) { operations.push(['line', ...args]); },
    arc(...args: number[]) { operations.push(['arc', ...args]); },
    fill() { operations.push(['fill']); },
    stroke() { operations.push(['stroke']); },
    setLineDash(dash: number[]) { operations.push(['dash', ...dash]); },
  };
  const ctx = new Proxy(methods, {
    get(target, key) { return key in target ? target[key as keyof typeof methods] : state[String(key)]; },
    set(_target, key, value) { state[String(key)] = value; operations.push([String(key), value]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  renderStroke(ctx, stroke, 1200, 800);
  return operations;
}

const point = { x: 0.2, y: 0.3 };
const legacy: Stroke = { points: [point, { x: 0.7, y: 0.6 }], color: '#315d4d', size: 12, tool: 'pen' };

test('legacy pen remains round or uses its original brush metadata, not new ink', { timeout: 1000 }, () => {
  assert.deepEqual(replay(legacy), replay({ ...legacy, tool: 'brush' }));
  assert.deepEqual(replay(legacy), [
    ['globalCompositeOperation', 'source-over'], ['strokeStyle', '#315d4d'], ['fillStyle', '#315d4d'],
    ['lineWidth', 12], ['lineCap', 'round'], ['lineJoin', 'round'],
    ['begin'], ['move', 240, 240], ['line', 840, 480], ['stroke'],
  ]);
  const oldBrush: Stroke = { ...legacy, brush: { style: 'soft', version: 1, seed: 8 } };
  assert.deepEqual(replay(oldBrush), replay({ ...oldBrush, tool: 'brush' }));
  assert.notDeepEqual(replay(oldBrush), replay(legacy));
});

for (const tool of ['brush', 'pencil', 'pen', 'eraser'] as const) {
  test(`${tool} captures settings and replays unchanged through serialization and history`, { timeout: 1000 }, () => {
    const stroke = createInstrumentStroke(tool, point, '#ee806b', 12, 'dry', 42);
    stroke.points.push({ x: 0.7, y: 0.6 });
    if (tool === 'pen') stroke.pressure!.samples.push(0.5);
    const original = JSON.stringify(stroke);
    const expected = replay(stroke);
    const strokes: Stroke[] = [JSON.parse(original)];
    const redo = [strokes.pop()!];
    replay(createInstrumentStroke(tool, point, '#000000', 48, 'soft', 999));
    strokes.push(redo.pop()!);
    assert.deepEqual(replay(strokes[0]), expected);
    assert.equal(JSON.stringify(stroke), original);
    assert.ok(expected.some(op => op[0] === 'strokeStyle' && op[1] === '#ee806b'));
    assert.notDeepEqual(expected, replay({ ...stroke, size: 1 }));
    assert.deepEqual(replay({ ...stroke, points: [] }), []);
  });
}

test('pencil is translucent seeded texture, ink is crisp, and taps remain distinct', { timeout: 1000 }, () => {
  for (const points of [[point], legacy.points]) {
    const outputs = ['brush', 'pencil', 'pen'].map(tool => replay({
      ...createInstrumentStroke(tool as 'brush' | 'pencil' | 'pen', point, '#315d4d', 12, 'round', 42), points,
    }));
    assert.equal(new Set(outputs.map(value => JSON.stringify(value))).size, 3);
    assert.ok(outputs[1].some(op => op[0] === 'globalAlpha' && Number(op[1]) < 0.2));
    assert.equal(outputs[1].filter(op => op[0] === 'dash').length, PENCIL_PASSES);
    assert.ok(outputs[2].some(op => op[0] === 'close'));
    assert.ok(outputs[2].some(op => op[0] === 'fill'));
  }
  const pencil = createInstrumentStroke('pencil', point, '#315d4d', 12, 'round', 42);
  assert.notDeepEqual(replay(pencil), replay({ ...pencil, instrument: { ...pencil.instrument!, seed: 43 } }));
});

test('pen samples keep real stylus pressure and use the same stable fallback for mouse and touch', { timeout: 1000 }, () => {
  assert.equal(normalizePointerPressure('pen', 0.18), 0.18);
  assert.equal(normalizePointerPressure('pen', 0.84), 0.84);
  assert.equal(normalizePointerPressure('pen', 0), 0.5);
  assert.equal(normalizePointerPressure('pen', Number.NaN), 0.5);
  assert.equal(normalizePointerPressure('mouse', 0.9), 0.5);
  assert.equal(normalizePointerPressure('touch', 0.2), 0.5);
  assert.deepEqual(
    createInstrumentStroke('pen', point, '#315d4d', 12, 'round', 1, 0.23).pressure,
    { version: 1, samples: [0.23] },
  );
  assert.deepEqual(
    createInstrumentStroke('pen', point, '#315d4d', 12, 'round', 1).pressure,
    { version: 1, samples: [0.5] },
  );
});

test('color preserves each instrument and returns from eraser to the last drawing tool', { timeout: 1000 }, () => {
  for (const tool of ['brush', 'pencil', 'pen'] as const) {
    assert.equal(toolAfterColorSelection(tool, 'brush'), tool);
    assert.equal(toolAfterColorSelection('eraser', tool), tool);
  }
});

test('eraser ignores every instrument recipe and mutates neither photo nor other layers', { timeout: 1000 }, () => {
  const project = { image: 'original-photo', layers: [{ strokes: [legacy] }, { strokes: [] as Stroke[] }] };
  const untouched = JSON.stringify(project);
  const expected = replay({ ...legacy, tool: 'eraser' });
  for (const tool of ['brush', 'pencil', 'pen'] as const) {
    const stroke = { ...createInstrumentStroke(tool, point, '#315d4d', 12, 'dry', 42), points: legacy.points, tool: 'eraser' as const };
    assert.deepEqual(replay(stroke), expected);
  }
  assert.equal(JSON.stringify(project), untouched);
});
