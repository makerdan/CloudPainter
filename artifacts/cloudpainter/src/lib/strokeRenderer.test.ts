import assert from 'node:assert/strict';
import test from 'node:test';
import { BRUSH_STYLES, DRY_PASSES, SOFT_PASSES, renderStroke, type Stroke } from './strokeRenderer.ts';

const fixture: Stroke = {
  points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }, { x: 0.8, y: 0.3 }],
  color: '#315d4d', size: 10, tool: 'pen',
};

function recordingContext() {
  const operations: unknown[][] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const stack: Record<string, unknown>[] = [];
  const methods = {
    save() { operations.push(['save']); stack.push({ ...state }); },
    restore() { operations.push(['restore']); Object.assign(state, stack.pop()); },
    beginPath() { operations.push(['beginPath']); },
    closePath() { operations.push(['closePath']); },
    moveTo(...args: number[]) { operations.push(['moveTo', ...args]); },
    lineTo(...args: number[]) { operations.push(['lineTo', ...args]); },
    arc(...args: number[]) { operations.push(['arc', ...args]); },
    fill() { operations.push(['fill']); },
    stroke() { operations.push(['stroke']); },
    setLineDash(dash: number[]) { operations.push(['setLineDash', ...dash]); },
  };
  const ctx = new Proxy(methods, {
    get(target, key) { return key in target ? target[key as keyof typeof methods] : state[String(key)]; },
    set(_target, key, value) { state[String(key)] = value; operations.push([String(key), value]); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, operations, state };
}

function replay(stroke: Stroke) {
  const recording = recordingContext();
  renderStroke(recording.ctx, stroke, 100, 200);
  return recording.operations;
}

test('legacy multi-point strokes retain the exact original round operations', { timeout: 1000 }, () => {
  assert.deepEqual(replay(fixture), [
    ['save'], ['globalCompositeOperation', 'source-over'], ['strokeStyle', fixture.color],
    ['fillStyle', fixture.color], ['lineWidth', 10], ['lineCap', 'round'], ['lineJoin', 'round'],
    ['beginPath'], ['moveTo', 10, 40], ['lineTo', 40, 100], ['lineTo', 80, 60], ['stroke'], ['restore'],
  ]);
});

test('legacy tap and eraser fixtures keep their original round geometry', { timeout: 1000 }, () => {
  const tap: Stroke = { ...fixture, points: [fixture.points[0]] };
  assert.deepEqual(replay(tap).slice(7), [
    ['beginPath'], ['arc', 10, 40, 5, 0, Math.PI * 2], ['fill'], ['restore'],
  ]);
  assert.deepEqual(replay({ ...tap, tool: 'eraser' }), replay(tap).map(operation =>
    operation[0] === 'globalCompositeOperation' ? ['globalCompositeOperation', 'destination-out'] : operation,
  ));
  assert.deepEqual(replay({ ...fixture, brush: { style: 'round', version: 1, seed: 42 } }), replay(fixture));
});

test('versioned pen pressure creates deterministic tapered outlines and changes with pressure', { timeout: 1000 }, () => {
  const pressurePen: Stroke = {
    ...fixture,
    instrument: { kind: 'pen', version: 2, seed: 7 },
    pressure: { version: 1, samples: [0.15, 0.9, 0.35] },
  };
  const expected = replay(pressurePen);
  assert.ok(expected.some(operation => operation[0] === 'closePath'));
  assert.ok(expected.some(operation => operation[0] === 'fill'));
  assert.ok(expected.filter(operation => operation[0] === 'lineTo').length > fixture.points.length);
  assert.deepEqual(replay(JSON.parse(JSON.stringify(pressurePen))), expected);
  assert.deepEqual(replay(pressurePen), expected);

  const light = replay({ ...pressurePen, pressure: { version: 1, samples: [0.1, 0.1, 0.1] } });
  const firm = replay({ ...pressurePen, pressure: { version: 1, samples: [0.9, 0.9, 0.9] } });
  assert.notDeepEqual(light, firm);

  const fallback = replay({ ...pressurePen, pressure: undefined });
  assert.deepEqual(fallback, replay({
    ...pressurePen, pressure: { version: 1, samples: pressurePen.points.map(() => 0.5) },
  }));
});

test('pressure sensitivity changes the rendered width response while existing and fallback strokes keep their response', { timeout: 1000 }, () => {
  const lightPressure: Stroke = {
    ...fixture,
    instrument: { kind: 'pen', version: 2, seed: 7 },
    pressure: { version: 1, samples: [0.2, 0.2, 0.2] },
  };
  const original = replay(lightPressure);
  const steady = replay({ ...lightPressure, pressure: { ...lightPressure.pressure!, sensitivity: 0 } });
  const responsive = replay({ ...lightPressure, pressure: { ...lightPressure.pressure!, sensitivity: 100 } });
  assert.notDeepEqual(steady, original);
  assert.notDeepEqual(responsive, original);
  assert.notDeepEqual(steady, responsive);
  assert.deepEqual(replay(lightPressure), original);
  assert.deepEqual(
    replay({ ...lightPressure, pressure: { version: 1, samples: lightPressure.pressure!.samples, sensitivity: 50 } }),
    original,
  );
  assert.deepEqual(
    replay({ ...lightPressure, pressure: { ...lightPressure.pressure!, sensitivity: Number.NaN } }),
    original,
  );
});

test('versioned pressure pen taps render a filled mark and empty strokes do no work', { timeout: 1000 }, () => {
  const tap: Stroke = {
    ...fixture,
    points: [fixture.points[0]],
    instrument: { kind: 'pen', version: 2, seed: 7 },
    pressure: { version: 1, samples: [0.6] },
  };
  assert.ok(replay(tap).some(operation => operation[0] === 'fill'));
  assert.deepEqual(replay({ ...tap, points: [], pressure: { version: 1, samples: [] } }), []);
});

for (const { style } of BRUSH_STYLES) {
  test(`${style} replays deterministically after persistence, undo/redo and a style change`, { timeout: 1000 }, () => {
    const stroke: Stroke = { ...fixture, brush: { style, version: 1, seed: 19342 } };
    const before = JSON.stringify(stroke);
    const expected = replay(stroke);
    const restored = JSON.parse(before) as Stroke;
    const strokes = [restored];
    const redo = [strokes.pop()!];
    // Choosing another style creates a new stroke; it never changes stored metadata.
    replay({ ...fixture, brush: { style: 'soft', version: 1, seed: 1 } });
    strokes.push(redo.pop()!);
    assert.deepEqual(replay(strokes[0]), expected);
    assert.equal(JSON.stringify(stroke), before);
    const ctx = recordingContext();
    renderStroke(ctx.ctx, restored, 100, 200);
    assert.deepEqual(ctx.operations, expected, 'export-sized replay uses the same renderer');
    assert.equal(ctx.state.globalAlpha, 1);
    assert.equal(ctx.state.globalCompositeOperation, 'source-over');
  });
}

test('all four brush recipes produce distinct geometry or paint operations, including taps', { timeout: 1000 }, () => {
  for (const points of [fixture.points, [fixture.points[0]]]) {
    const outputs = BRUSH_STYLES.map(({ style }) => JSON.stringify(replay({
      ...fixture, points, brush: { style, version: 1, seed: 17 },
    })));
    assert.equal(new Set(outputs).size, 4);
  }
});

test('dry texture changes with recorded seeds but not between replay calls', { timeout: 1000 }, () => {
  const stroke: Stroke = { ...fixture, brush: { style: 'dry', version: 1, seed: 1 } };
  assert.notDeepEqual(replay(stroke), replay({ ...stroke, brush: { ...stroke.brush!, seed: 2 } }));
  assert.deepEqual(replay(stroke), replay(stroke));
});

test('soft and dry work has fixed pass counts independent of brush size and point distances', { timeout: 1000 }, () => {
  for (const size of [1, 48, 2000]) {
    for (const [style, passes] of [['soft', SOFT_PASSES], ['dry', DRY_PASSES]] as const) {
      const operations = replay({ ...fixture, size, brush: { style, version: 1, seed: 0 } });
      assert.equal(operations.filter(op => op[0] === 'stroke').length, passes);
      assert.equal(operations.filter(op => op[0] === 'lineTo').length, (fixture.points.length - 1) * passes);
    }
  }
});

test('erasers ignore brush metadata and affect only the supplied layer context', { timeout: 1000 }, () => {
  const under = recordingContext();
  const selected = recordingContext();
  renderStroke(under.ctx, fixture, 100, 200);
  const untouched = JSON.stringify(under.operations);
  for (const { style } of BRUSH_STYLES) {
    const eraser: Stroke = { ...fixture, tool: 'eraser', brush: { style, version: 1, seed: 3 } };
    assert.deepEqual(replay(eraser), replay({ ...fixture, tool: 'eraser' }));
    renderStroke(selected.ctx, eraser, 100, 200);
  }
  assert.equal(JSON.stringify(under.operations), untouched);
  assert.equal(selected.operations.filter(op => op[0] === 'globalCompositeOperation' && op[1] === 'destination-out').length, 4);
  assert.equal(selected.state.globalCompositeOperation, 'source-over');
});

test('every brush uses its recorded color and size; empty strokes perform no work', { timeout: 1000 }, () => {
  for (const { style } of BRUSH_STYLES) {
    const small: Stroke = { ...fixture, color: '#ee806b', size: 2, brush: { style, version: 1, seed: 3 } };
    const ops = replay(small);
    assert.ok(ops.some(op => op[0] === 'strokeStyle' && op[1] === small.color));
    assert.ok(ops.some(op => op[0] === 'fillStyle' && op[1] === small.color));
    assert.notDeepEqual(ops, replay({ ...small, size: 48 }));
    assert.deepEqual(replay({ ...small, points: [] }), []);
  }
});

test('malformed runtime stroke data is rejected without issuing canvas operations', { timeout: 1000 }, () => {
  for (const malformed of [
    { ...fixture, points: null },
    { ...fixture, points: [{ x: 0.2, y: Number.NaN }] },
    { ...fixture, size: Infinity },
  ]) {
    const recording = recordingContext();
    renderStroke(recording.ctx, malformed as unknown as Stroke, 100, 200);
    assert.deepEqual(recording.operations, []);
  }
  const malformedPressure = {
    ...fixture,
    instrument: { kind: 'pen', version: 2, seed: 8 },
    pressure: { version: 1, samples: null },
  };
  const recording = recordingContext();
  renderStroke(recording.ctx, malformedPressure as unknown as Stroke, 100, 200);
  assert.ok(recording.operations.some(operation => operation[0] === 'closePath'));
});
