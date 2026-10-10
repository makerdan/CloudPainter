import { useEffect, useRef } from 'react';
import { TooltipButton } from '@/components/tooltip-button';
import { BRUSH_STYLES, renderStroke, type BrushStyle } from '@/lib/strokeRenderer';

function BrushPreview({ style, color }: { style: BrushStyle; color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 48);
    renderStroke(ctx, {
      points: [{ x: 0.1, y: 0.65 }, { x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.7 }, { x: 0.9, y: 0.35 }],
      color, size: 16, tool: 'pen', brush: { style, version: 1, seed: 42 },
    }, 160, 48);
  }, [style, color]);
  return <canvas ref={canvas} width={160} height={48} aria-hidden="true" />;
}

export function BrushStyleControl({ value, color, onChange, embedded = false }: { value: BrushStyle; color: string; onChange: (style: BrushStyle) => void; embedded?: boolean }) {
  return (
    <div className={embedded ? 'brush-style-control' : 'control-block brush-style-control'}>
      {!embedded && <div className="control-head"><span>Brush style</span></div>}
      <div className="brush-style-grid" role="group" aria-label="Brush style">
        {BRUSH_STYLES.map(({ style, label, description }) => (
          <TooltipButton
            key={style}
            type="button"
            description={`${description} Select this style and return to drawing.`}
            className={`brush-style-button ${value === style ? 'selected' : ''}`}
            aria-label={label}
            aria-pressed={value === style}
            onClick={() => onChange(style)}
            data-testid={`button-brush-${style}`}
          >
            <BrushPreview style={style} color={color} />
            <span>{label}</span>
          </TooltipButton>
        ))}
      </div>
    </div>
  );
}
