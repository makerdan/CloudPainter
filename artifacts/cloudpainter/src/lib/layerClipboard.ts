import { renderStroke, type Stroke } from './strokeRenderer.ts';

// Each entry is one history action. Legacy strokes remain unchanged.
export type BackgroundFill = { kind: 'background-fill'; color: string };
export type ClearDrawing = { kind: 'clear' };
export type DrawingEntry = Stroke | BackgroundFill | ClearDrawing | { kind: 'paste'; entries: DrawingEntry[] };
export type DrawingHistory = { strokes: DrawingEntry[]; redo: DrawingEntry[] };
export type DrawingClipboard = readonly DrawingEntry[];

export function isPaste(entry: DrawingEntry): entry is { kind: 'paste'; entries: DrawingEntry[] } {
  return 'kind' in entry && entry.kind === 'paste';
}

export function isBackgroundFill(entry: DrawingEntry): entry is BackgroundFill {
  return 'kind' in entry && entry.kind === 'background-fill';
}

export function isClear(entry: DrawingEntry): entry is ClearDrawing {
  return 'kind' in entry && entry.kind === 'clear';
}

function currentDrawingEntries(entries: readonly DrawingEntry[]): DrawingEntry[] {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (isClear(entries[index])) return entries.slice(index + 1);
  }
  return [...entries];
}

export function hasDrawing(source: DrawingHistory | undefined): boolean {
  return Boolean(source && currentDrawingEntries(source.strokes).length);
}

function freezeSnapshot(entries: DrawingEntry[]): DrawingClipboard {
  for (const entry of entries) {
    if (isPaste(entry)) freezeSnapshot(entry.entries);
    else if (!isBackgroundFill(entry) && !isClear(entry)) {
      entry.points.forEach(Object.freeze);
      Object.freeze(entry.points);
      if (entry.brush) Object.freeze(entry.brush);
      if (entry.instrument) Object.freeze(entry.instrument);
      if (entry.pressure) {
        Object.freeze(entry.pressure.samples);
        Object.freeze(entry.pressure);
      }
    }
    Object.freeze(entry);
  }
  return Object.freeze(entries);
}

export function copyDrawing(source: DrawingHistory | undefined): DrawingClipboard | null {
  if (!source) return null;
  const entries = currentDrawingEntries(source.strokes);
  if (!entries.length) return null;
  return freezeSnapshot(structuredClone(entries));
}

export function pasteDrawing<T extends DrawingHistory>(destination: T, clipboard: DrawingClipboard | null): T {
  if (!clipboard?.length) return destination;
  return {
    ...destination,
    strokes: [...destination.strokes, { kind: 'paste', entries: structuredClone([...clipboard]) }],
    redo: [],
  };
}

export function pasteIntoLayers<T extends DrawingHistory & { id: string }>(
  layers: T[], destinationId: string, clipboard: DrawingClipboard | null,
): T[] {
  if (!clipboard?.length || !layers.some(layer => layer.id === destinationId)) return layers;
  return layers.map(layer => layer.id === destinationId ? pasteDrawing(layer, clipboard) : layer);
}

export function clearDrawing<T extends DrawingHistory>(layer: T): T {
  if (!layer.strokes.length || isClear(layer.strokes.at(-1)!)) {
    return layer.redo.length ? { ...layer, redo: [] } : layer;
  }
  return { ...layer, strokes: [...layer.strokes, { kind: 'clear' }], redo: [] };
}

export function undoDrawing<T extends DrawingHistory>(layer: T): T {
  if (!layer.strokes.length) return layer;
  return { ...layer, strokes: layer.strokes.slice(0, -1), redo: [...layer.redo, layer.strokes.at(-1)!] };
}

export function redoDrawing<T extends DrawingHistory>(layer: T): T {
  if (!layer.redo.length) return layer;
  return { ...layer, strokes: [...layer.strokes, layer.redo.at(-1)!], redo: layer.redo.slice(0, -1) };
}

export function renderDrawing(
  context: CanvasRenderingContext2D, entries: readonly DrawingEntry[], width: number, height: number,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): void {
  for (const entry of entries) {
    if (isClear(entry)) {
      context.clearRect(0, 0, width, height);
      continue;
    }
    if (!isPaste(entry)) {
      if (isBackgroundFill(entry)) {
        context.save();
        try {
          context.globalCompositeOperation = 'source-over';
          context.globalAlpha = 1;
          context.fillStyle = entry.color;
          context.fillRect(0, 0, width, height);
        } finally {
          context.restore();
        }
      } else {
        renderStroke(context, entry, width, height);
      }
      continue;
    }
    // Replay on transparent scratch space: copied erasers never touch prior
    // destination content. Nested pastes retain the same isolation on recopy.
    const isolated = createCanvas();
    isolated.width = width;
    isolated.height = height;
    const isolatedContext = isolated.getContext('2d');
    if (!isolatedContext) throw new Error('Could not render pasted drawing.');
    renderDrawing(isolatedContext, entry.entries, width, height, createCanvas);
    context.save();
    try {
      context.globalCompositeOperation = 'source-over';
      context.drawImage(isolated, 0, 0);
    } finally {
      context.restore();
      // Release backing storage after compositing rather than retaining a canvas per paste.
      isolated.width = 0;
      isolated.height = 0;
    }
  }
}
