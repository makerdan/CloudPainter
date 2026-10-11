import { getStroke } from 'perfect-freehand';

export type Point = { x: number; y: number };
export type BrushStyle = 'round' | 'chisel' | 'soft' | 'dry';
export type DrawingTool = 'brush' | 'pencil' | 'pen' | 'eraser';
export type Stroke = {
  points: Point[];
  color: string;
  size: number;
  tool: DrawingTool;
  // Absent on legacy projects. Version pins the recipe for future renderer changes.
  brush?: { style: BrushStyle; version: 1; seed: number };
  // Legacy "pen" records have no instrument: keep their old brush recipe.
  instrument?:
    | { kind: 'pencil' | 'pen'; version: 1; seed: number }
    | { kind: 'pen'; version: 2; seed: number };
  // Version 1 is normalized pressure aligned one-to-one with points.
  pressure?: { version: 1; samples: number[] };
};

export const BRUSH_STYLES: { style: BrushStyle; label: string; description: string }[] = [
  { style: 'round', label: 'Solid round', description: 'Smooth, opaque strokes with rounded ends.' },
  { style: 'chisel', label: 'Flat / chisel', description: 'A flat diagonal tip: broad sweeps and narrow edges as direction changes.' },
  { style: 'soft', label: 'Soft', description: 'Translucent strokes with feathered edges; overlap strokes to build color.' },
  { style: 'dry', label: 'Dry brush', description: 'Broken, textured bristles with gaps that let the photograph show through.' },
];

// Fixed pass counts bound work to O(points), even at size 1 or on long touch strokes.
export const SOFT_PASSES = 8;
export const DRY_PASSES = 12;
export const PENCIL_PASSES = 8;

function roundPath(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number, offsetX = 0, offsetY = 0) {
  const first = stroke.points[0];
  ctx.beginPath();
  if (stroke.points.length === 1) {
    ctx.arc(first.x * width + offsetX, first.y * height + offsetY, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(first.x * width + offsetX, first.y * height + offsetY);
    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      ctx.lineTo(point.x * width + offsetX, point.y * height + offsetY);
    }
    ctx.stroke();
  }
}

function pressurePath(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  const samples = stroke.pressure?.version === 1 && stroke.pressure.samples.length === stroke.points.length
    ? stroke.pressure.samples
    : stroke.points.map(() => 0.5);
  const outline = getStroke(stroke.points.map((point, index) => [
    point.x * width,
    point.y * height,
    Number.isFinite(samples[index]) ? Math.max(0, Math.min(1, samples[index])) : 0.5,
  ] as [number, number, number]), {
    size: stroke.size,
    thinning: 0.7,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: false,
    last: true,
  });
  if (!outline.length) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index++) ctx.lineTo(outline[index][0], outline[index][1]);
  ctx.closePath();
  ctx.fill();
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  if (!stroke.points.length) return;
  ctx.save();
  try {
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const style = stroke.brush?.style ?? 'round';
    // Preserve the original operations exactly for metadata-free strokes and erasers.
    if (stroke.tool !== 'eraser' && stroke.instrument?.kind === 'pencil') {
      const random = seededRandom(stroke.instrument.seed);
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * 0.16;
      ctx.lineWidth = stroke.size * 0.75;
      roundPath(ctx, stroke, width, height);
      for (let pass = 0; pass < PENCIL_PASSES; pass++) {
        const spread = (pass / (PENCIL_PASSES - 1) - 0.5) * stroke.size * 0.8;
        ctx.globalAlpha = alpha * (0.07 + random() * 0.06);
        ctx.lineWidth = Math.max(0.15, stroke.size * (0.06 + random() * 0.06));
        ctx.setLineDash([stroke.size * (0.3 + random()), stroke.size * (0.1 + random() * 0.3)]);
        ctx.lineDashOffset = random() * stroke.size * 3;
        roundPath(ctx, stroke, width, height, spread, (random() - 0.5) * stroke.size * 0.2);
      }
    } else if (stroke.tool === 'pen' && stroke.instrument?.kind === 'pen' && stroke.instrument.version === 2) {
      pressurePath(ctx, stroke, width, height);
    } else if (stroke.tool !== 'eraser' && stroke.instrument?.kind === 'pen') {
      // Uniform ink with sharp ends/corners, distinct from a rounded brush tip.
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 2;
      roundPath(ctx, stroke, width, height);
    } else if (stroke.tool === 'eraser' || style === 'round') {
      roundPath(ctx, stroke, width, height);
    } else if (style === 'chisel') {
      // Sweep a fixed 45-degree nib along the entire path, with a thin edge.
      const offset = stroke.size * 0.32;
      ctx.lineWidth = stroke.size * 0.22;
      ctx.lineJoin = 'bevel';
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        const x = point.x * width - offset;
        const y = point.y * height - offset;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let i = stroke.points.length - 1; i >= 0; i--) {
        const point = stroke.points[i];
        ctx.lineTo(point.x * width + offset, point.y * height + offset);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (style === 'soft') {
      const alpha = ctx.globalAlpha;
      for (let pass = 0; pass < SOFT_PASSES; pass++) {
        ctx.globalAlpha = alpha * 0.085;
        ctx.lineWidth = stroke.size * (1 - pass * 0.1);
        roundPath(ctx, stroke, width, height);
      }
    } else if (style === 'dry') {
      const random = seededRandom(stroke.brush?.seed ?? 0);
      const alpha = ctx.globalAlpha;
      for (let pass = 0; pass < DRY_PASSES; pass++) {
        const spread = (pass / (DRY_PASSES - 1) - 0.5) * stroke.size * 0.85;
        const jitter = (random() - 0.5) * stroke.size * 0.12;
        ctx.globalAlpha = alpha * (0.4 + random() * 0.4);
        ctx.lineWidth = Math.max(0.15, stroke.size * (0.025 + random() * 0.04));
        ctx.setLineDash([stroke.size * (0.25 + random()), stroke.size * (0.15 + random() * 0.45)]);
        ctx.lineDashOffset = random() * stroke.size * 4;
        roundPath(ctx, stroke, width, height, spread, -spread + jitter);
      }
    }
  } finally {
    ctx.restore();
  }
}
