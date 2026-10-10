import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { TooltipButton } from './tooltip-button';

/** Hidden content stays mounted, retaining drafts and account-palette state. */
export function BrushDisclosure({ title, summary, children, defaultOpen = false, id, reminder = false }: {
  title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; id: string; reminder?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return <section className={`brush-disclosure ${reminder ? 'tool-tip-card' : 'control-block'}`}>
    <h3>
      <TooltipButton className="brush-disclosure-trigger" aria-expanded={open} aria-controls={contentId}
        data-testid={`disclosure-${id}`}
        description={`${open ? 'Hide' : 'Show'} ${title.toLowerCase()} ${reminder ? 'guidance' : 'controls'} without changing your drawing or settings.`}
        onClick={() => setOpen(value => !value)}>
        <span className="brush-disclosure-title">{title}</span>
        {summary && <span className="control-value">{summary}</span>}
        <ChevronDown size={14} className="disclosure-chevron" aria-hidden="true" />
      </TooltipButton>
    </h3>
    <div id={contentId} hidden={!open} className="brush-disclosure-content">{children}</div>
  </section>;
}
