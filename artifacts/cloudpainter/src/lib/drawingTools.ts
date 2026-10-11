import type { BrushStyle, DrawingTool, Point, Stroke } from './strokeRenderer.ts';

export type DrawingInstrument = Exclude<DrawingTool, 'eraser'>;

export const TOOL_GUIDANCE: Record<DrawingTool, string> = {
  brush: 'Brush: paint with your chosen brush style on the selected layer.',
  pencil: 'Pencil: sketch light, textured graphite-like lines in your chosen color.',
  pen: 'Pen: draw crisp, opaque ink lines with clean-cut ends.',
  eraser: 'Eraser: remove marks only from the selected layer; the photo stays untouched.',
};

export const BACKGROUND_TOOL_GUIDANCE = 'Background: click the canvas to fill the selected layer with your current color.';

export const DEFAULT_PEN_PRESSURE = 0.5;

export function normalizePointerPressure(pointerType: string, pressure: number): number {
  if (pointerType !== 'pen' || !Number.isFinite(pressure) || pressure <= 0) return DEFAULT_PEN_PRESSURE;
  return Math.max(0, Math.min(1, pressure));
}

export function toolAfterColorSelection(tool: DrawingTool, lastDrawingTool: DrawingInstrument): DrawingInstrument {
  return tool === 'eraser' ? lastDrawingTool : tool;
}

export function createInstrumentStroke(
  tool: DrawingTool, point: Point, color: string, size: number, style: BrushStyle, seed: number,
  pressure = DEFAULT_PEN_PRESSURE, pressureSensitivity = 50,
): Stroke {
  const sensitivity = Number.isFinite(pressureSensitivity)
    ? Math.max(0, Math.min(100, pressureSensitivity))
    : 50;
  return {
    points: [point], color, size, tool,
    ...(tool === 'brush' ? { brush: { style, version: 1 as const, seed } } : {}),
    ...(tool === 'pencil' ? { instrument: { kind: tool, version: 1 as const, seed } } : {}),
    ...(tool === 'pen' ? {
      instrument: { kind: tool, version: 2 as const, seed },
      pressure: {
        version: 1 as const,
        samples: [normalizePointerPressure('pen', pressure)],
        ...(sensitivity === 50 ? {} : { sensitivity }),
      },
    } : {}),
  };
}
