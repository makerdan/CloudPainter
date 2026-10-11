import assert from 'node:assert/strict';
import test from 'node:test';
import { copyDrawing, isBackgroundFill, isPaste, pasteDrawing, pasteIntoLayers, redoDrawing, renderDrawing, undoDrawing, type DrawingEntry } from './layerClipboard.ts';
import { renderStroke, type Stroke } from './strokeRenderer.ts';

const stroke: Stroke = { tool: 'brush', color: '#336699', size: 14, points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.3 }], brush: { style: 'dry', version: 1, seed: 42 } };
const eraser: Stroke = { ...stroke, tool: 'eraser', points: [{ x: 0.5, y: 0.3 }] };
const source = () => ({
  id: 'source', name: 'Source', opacity: 0.4, visible: false,
  strokes: [structuredClone(stroke), structuredClone(eraser)] as DrawingEntry[], redo: [] as DrawingEntry[],
});
const destination = () => ({ id: 'dest', name: 'Destination', opacity: 0.7, visible: true, strokes: [structuredClone(stroke)] as DrawingEntry[], redo: [] as DrawingEntry[] });
const options = { timeout: 1000 };

test('clipboard is an immutable independent snapshot; deleting or editing source cannot change it', options, () => {
  const src = source();
  const clipboard = copyDrawing(src)!;
  const expected = JSON.stringify(clipboard);
  (src.strokes[0] as Stroke).points[0].x = 0.9;
  (src.strokes[0] as Stroke).brush!.seed = 99;
  src.strokes.length = 0;
  assert.equal(JSON.stringify(clipboard), expected);
  assert.ok(Object.isFrozen(clipboard));
  assert.ok(Object.isFrozen((clipboard[0] as Stroke).points[0]));
  assert.ok(Object.isFrozen((clipboard[0] as Stroke).brush));
});

test('background fills copy, paste, undo, redo and replay as one full-layer action', options, () => {
  const fill = { kind: 'background-fill', color: '#cc2200' } as const;
  const original = { ...source(), strokes: [structuredClone(fill)] as DrawingEntry[] };
  const clipboard = copyDrawing(original)!;
  assert.ok(Object.isFrozen(clipboard));
  assert.ok(isBackgroundFill(clipboard[0]));
  assert.ok(Object.isFrozen(clipboard[0]));
  const pasted = pasteDrawing(destination(), clipboard);
  assert.ok(isPaste(pasted.strokes.at(-1)!));

  const log = recorder();
  renderDrawing(log.context, pasted.strokes, 1200, 800, log.createCanvas);
  assert.ok(log.events.some(event => event[1] === 'fillRect' && event[2] === 0 && event[3] === 0 && event[4] === 1200 && event[5] === 800));
  assert.ok(log.events.some(event => event[1] === 'fillStyle' && event[2] === fill.color));

  const undone = undoDrawing(pasted);
  assert.deepEqual(undone.strokes, destination().strokes);
  const restored = redoDrawing(JSON.parse(JSON.stringify(undone)));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(pasted)));
  const restoredPaste = restored.strokes.at(-1)!;
  assert.ok(isPaste(restoredPaste));
  assert.ok(isBackgroundFill(restoredPaste.entries[0]));
});

test('pressure-aware pen samples survive layer copy, paste, undo/redo and JSON replay', options, () => {
  const pressurePen: Stroke = {
    tool: 'pen', color: '#315d4d', size: 12, points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.3 }],
    instrument: { kind: 'pen', version: 2, seed: 5 },
    pressure: { version: 1, samples: [0.2, 0.8] },
  };
  const original = { ...source(), strokes: [pressurePen] as DrawingEntry[] };
  const clipboard = copyDrawing(original)!;
  const copied = clipboard[0] as Stroke;
  assert.deepEqual(copied.pressure, pressurePen.pressure);
  assert.ok(Object.isFrozen(copied.pressure!.samples));
  const pasted = pasteDrawing(destination(), clipboard);
  const undone = undoDrawing(pasted);
  const restored = redoDrawing(JSON.parse(JSON.stringify(undone)));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(pasted)));
  const before = recorder(), after = recorder();
  renderDrawing(before.context, pasted.strokes, 1200, 800, before.createCanvas);
  renderDrawing(after.context, restored.strokes, 1200, 800, after.createCanvas);
  assert.deepEqual(after.events, before.events);
  assert.ok(after.events.some(event => event[1] === 'closePath'));
});

test('paste appends one independent action, preserves destination settings, clears redo and leaves source untouched', options, () => {
  const src = source(), dest = { ...destination(), redo: [structuredClone(eraser)] };
  const before = JSON.stringify(src);
  const clipboard = copyDrawing(src)!;
  const pasted = pasteDrawing(dest, clipboard);
  assert.equal(pasted.strokes.length, 2);
  assert.equal(pasted.strokes[0], dest.strokes[0]);
  assert.equal(pasted.name, dest.name);
  assert.equal(pasted.opacity, dest.opacity);
  assert.equal(pasted.visible, dest.visible);
  assert.deepEqual(pasted.redo, []);
  assert.equal(JSON.stringify(src), before);
  const entry = pasted.strokes[1];
  assert.ok(isPaste(entry));
  (entry.entries[0] as Stroke).points[0].x = 0.8;
  const another = pasteDrawing(dest, clipboard).strokes[1];
  assert.ok(isPaste(another));
  assert.equal((another.entries[0] as Stroke).points[0].x, 0.2);
});

test('one undo/redo handles entire paste while ordinary strokes keep their history order', options, () => {
  const dest = destination();
  const pasted = pasteDrawing(dest, copyDrawing(source()));
  const undone = undoDrawing(pasted);
  assert.deepEqual(undone.strokes, dest.strokes);
  assert.deepEqual(redoDrawing(undone), pasted);
  const drawn = { ...pasted, strokes: [...pasted.strokes, eraser] };
  assert.deepEqual(undoDrawing(drawn).strokes, pasted.strokes);
  assert.deepEqual(undoDrawing(undoDrawing(drawn)).strokes, dest.strokes);
  assert.deepEqual(redoDrawing(redoDrawing(undoDrawing(undoDrawing(drawn)))), drawn);
});

test('empty clipboard/source and deleted/invalid destinations are explicit no-ops; selection never falls back', options, () => {
  assert.equal(copyDrawing(undefined), null);
  assert.equal(copyDrawing({ strokes: [], redo: [stroke] }), null);
  const layers = [source(), destination()];
  assert.equal(pasteIntoLayers(layers, 'deleted', copyDrawing(source())), layers);
  assert.equal(pasteIntoLayers(layers, 'dest', null), layers);
  const pasted = pasteIntoLayers(layers, 'dest', copyDrawing(source()));
  assert.equal(pasted[0], layers[0]);
  assert.equal(pasted[1].strokes.length, 2);
});

// Record canvas operations and the identity of their context, including scratch
// surfaces; real pixel parity and export are covered by the browser regression.
function recorder() {
  const events: unknown[][] = [];
  const make = (label: string) => {
    const state: Record<string, unknown> = { globalAlpha: 1 };
    const stack: Record<string, unknown>[] = [];
    return new Proxy({}, {
      get(_target, key) {
        if (key in state) return state[String(key)];
        return (...args: unknown[]) => {
          events.push([label, String(key), ...args.map(a => typeof a === 'object' ? '[object]' : a)]);
          if (key === 'save') stack.push({ ...state });
          if (key === 'restore') Object.assign(state, stack.pop());
        };
      },
      set(_target, key, value) { state[String(key)] = value; events.push([label, String(key), value]); return true; },
    }) as CanvasRenderingContext2D;
  };
  let index = 0;
  return {
    events, context: make('destination'),
    createCanvas: () => {
      const context = make(`isolated-${++index}`);
      return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    },
  };
}

test('copied and recopied erasers are replayed only on isolated surfaces, never on destination', options, () => {
  const pasted = pasteDrawing(destination(), copyDrawing(source()));
  const twice = pasteDrawing(destination(), copyDrawing(pasted));
  const log = recorder();
  renderDrawing(log.context, twice.strokes, 1200, 800, log.createCanvas);
  assert.ok(log.events.some(e => e[1] === 'globalCompositeOperation' && e[2] === 'destination-out'));
  assert.ok(log.events.filter(e => e[1] === 'globalCompositeOperation' && e[2] === 'destination-out').every(e => e[0] !== 'destination'));
  assert.equal(log.events.filter(e => e[1] === 'drawImage').length, 2);
});

test('legacy fixtures replay unchanged; new groups/history preserve all brush and instrument metadata after JSON restore', options, () => {
  const fixtures: Stroke[] = [
    { ...stroke, tool: 'pen', brush: undefined },
    ...(['round', 'chisel', 'soft', 'dry'] as const).map(style => ({ ...stroke, brush: { style, version: 1 as const, seed: 18 } })),
    ...(['pencil', 'pen'] as const).map(kind => ({ ...stroke, tool: kind, brush: undefined, instrument: { kind, version: 1 as const, seed: 91 } })),
    eraser,
  ];
  const old = recorder(), direct = recorder();
  renderDrawing(old.context, fixtures, 1200, 800, old.createCanvas);
  fixtures.forEach(entry => renderStroke(direct.context, entry, 1200, 800));
  assert.deepEqual(old.events, direct.events);
  const pasted = pasteDrawing(destination(), copyDrawing({ strokes: fixtures, redo: [] }));
  const undone = undoDrawing(pasted);
  const restored = redoDrawing(JSON.parse(JSON.stringify(undone)));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(pasted)));
  const before = recorder(), after = recorder();
  renderDrawing(before.context, pasted.strokes, 1200, 800, before.createCanvas);
  renderDrawing(after.context, restored.strokes, 1200, 800, after.createCanvas);
  assert.deepEqual(after.events, before.events);
});
