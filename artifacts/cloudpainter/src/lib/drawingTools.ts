import type { BrushStyle, DrawingTool, Point, Stroke } from './strokeRenderer.ts';

export type DrawingInstrument = Exclude<DrawingTool, 'eraser'>;

export const TOOL_GUIDANCE: Record<DrawingTool, string> = {
  brush: 'Brush: paint with your chosen brush style on the selected layer.',
  pencil: 'Pencil: sketch light, textured graphite-like lines in your chosen color.',
  pen: 'Pen: draw crisp, opaque ink lines with clean-cut ends.',
  eraser: 'Eraser: remove marks only from the selected layer; the photo stays untouched.',
};

export function toolAfterColorSelection(tool: DrawingTool, lastDrawingTool: DrawingInstrument): DrawingInstrument {
  return tool === 'eraser' ? lastDrawingTool : tool;
}

export function createInstrumentStroke(
  tool: DrawingTool, point: Point, color: string, size: number, style: BrushStyle, seed: number,
): Stroke {
  return {
    points: [point], color, size, tool,
    ...(tool === 'brush' ? { brush: { style, version: 1 as const, seed } } : {}),
    ...(tool === 'pencil' || tool === 'pen' ? { instrument: { kind: tool, version: 1 as const, seed } } : {}),
  };
}
