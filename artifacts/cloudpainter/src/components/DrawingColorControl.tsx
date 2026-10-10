import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { ActionTooltip, TooltipButton } from '@/components/tooltip-button';
import { COLOR_GROUPS, normalizeHexColor } from '@/lib/drawingColors';
import { AccountPalette } from './AccountPalette';

type Props = { color: string; tool: 'pen' | 'eraser'; onChange: (color: string) => void };

export function DrawingColorControl({ color, tool, onChange }: Props) {
  const [hex, setHex] = useState(color.toUpperCase());
  const [error, setError] = useState('');
  const fieldId = useId();
  const selected = COLOR_GROUPS.flatMap(group => group.colors).find(swatch => swatch.hex === color);

  useEffect(() => {
    setHex(color.toUpperCase());
    setError('');
  }, [color]);

  return (
    <div className="drawing-colors">
      <div className="selected-color" role="status" aria-live="polite" data-testid="selected-color">
        <span className="selected-color-preview" style={{ background: color }} aria-hidden="true" />
        <span>{selected?.name ?? 'Custom'} <strong>{color.toUpperCase()}</strong></span>
      </div>
      <div className="preset-color-grid" aria-label="Preset drawing colors">
      {COLOR_GROUPS.map((group, groupIndex) => (
        <div key={group.name} role="group" aria-label={`${group.name} drawing colors`}>
          <div className="color-row">
            {group.colors.map((swatch, index) => (
              <TooltipButton
                key={swatch.hex}
                description={`${color === swatch.hex && tool === 'pen' ? 'Current drawing color' : 'Use drawing color'}: ${swatch.name.toLowerCase()} (${swatch.hex.toUpperCase()})${tool === 'eraser' ? ' and switch from erasing to drawing' : ''}.`}
                className={`swatch ${color === swatch.hex ? 'active' : ''}`}
                style={{ background: swatch.hex }}
                aria-label={`Choose ${swatch.name} (${swatch.hex.toUpperCase()})`}
                aria-pressed={color === swatch.hex}
                onClick={() => onChange(swatch.hex)}
                data-testid={`button-color-${groupIndex * 8 + index + 1}`}
              >
                {color === swatch.hex && <Check size={16} className="swatch-check" aria-hidden="true" />}
              </TooltipButton>
            ))}
          </div>
        </div>
      ))}
      </div>
      <form className="custom-color-form" onSubmit={event => {
        event.preventDefault();
        const normalized = normalizeHexColor(hex);
        if (!normalized) {
          setError('Use 3 or 6 hex digits, such as #ABC or #A1B2C3.');
          return;
        }
        onChange(normalized);
        setHex(normalized.toUpperCase());
        setError('');
      }} noValidate>
        <label className="sr-only" htmlFor={`${fieldId}-picker`}>Custom picker</label>
        <label className="sr-only" htmlFor={`${fieldId}-hex`}>Hex color</label>
        <div className="custom-color-entry">
          <ActionTooltip description="Open the color picker to choose any drawing color.">
            <input id={`${fieldId}-picker`} type="color" value={color}
              onChange={event => onChange(event.target.value)}
              data-testid="input-color-custom" />
          </ActionTooltip>
          <ActionTooltip description="Enter 3 or 6 hex digits, with an optional #, then press Enter or Apply.">
          <input id={`${fieldId}-hex`} type="text" value={hex} spellCheck={false}
            autoComplete="off" placeholder="#A1B2C3" aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-feedback` : undefined}
            onChange={event => { setHex(event.target.value); setError(''); }}
            data-testid="input-color-hex" />
          </ActionTooltip>
          <TooltipButton type="submit" className="button"
            description="Apply the hex color and switch to drawing; accepts 3 or 6 hex digits."
            data-testid="button-apply-color">Apply</TooltipButton>
        </div>
        <p id={`${fieldId}-feedback`} className="hex-color-feedback invalid"
          aria-live="polite" hidden={!error}>{error}</p>
      </form>
      <AccountPalette color={color} onChange={onChange} />
    </div>
  );
}
