import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { TooltipButton } from '@/components/tooltip-button';
import { runLocalOutline, traceImageEdges, type OutlineCandidate, type OutlineRegion } from '../lib/outlineInference';
import { getOutlineConfig, runHostedOutline } from '../lib/outlineHosted';
import { usePaletteAccount } from './Account';
import { OutlineRequestGuard } from '../lib/outlineGeometry';

type Method = 'local' | 'hosted' | 'trace';
type Status = 'idle' | 'loading' | 'error' | 'empty' | 'ready' | 'cancelled' | 'accepted';
type Props = {
  image: string;
  contextKey: string;
  onAccept: (points: Array<{ x: number; y: number }>) => void;
  onClose: () => void;
};

const FULL: OutlineRegion = { x: 0, y: 0, width: 1, height: 1 };
const METHODS: Array<{ id: Method; label: string; tip: string }> = [
  { id: 'local', label: 'On-device', tip: 'Accuracy: recognizes common object classes, not imagined figures. Performance: downloads a large model on first use; CPU inference may be slow. Privacy: photo pixels never leave this browser.' },
  { id: 'hosted', label: 'Hosted AI', tip: 'Accuracy: GPT-Image-2 generates approximate masks; review for changed or missed details. Performance: a paid server request, with a two-minute deadline. Privacy: sends only the selected downsized photo region to Poe and OpenAI after consent.' },
  { id: 'trace', label: 'Trace an edge', tip: 'Accuracy: follows strong edges in the selected area. Performance: fast. Privacy: runs entirely on this device.' },
];
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function OutlinePanel({ image, contextKey, onAccept, onClose }: Props) {
  const [method, setMethod] = useState<Method>('local');
  const [region, setRegion] = useState<OutlineRegion>(FULL);
  const [sensitivity, setSensitivity] = useState(0.5);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [candidates, setCandidates] = useState<OutlineCandidate[]>([]);
  const [selected, setSelected] = useState(0);
  const [consent, setConsent] = useState(false);
  const [subject, setSubject] = useState('');
  const [hostedError, setHostedError] = useState('Checking hosted availability…');
  const [hostedAllowed, setHostedAllowed] = useState(false);
  const account = usePaletteAccount();
  const abortRef = useRef<AbortController | null>(null);
  const guard = useRef(new OutlineRequestGuard());
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const invalidate = useCallback(() => {
    guard.current.invalidate();
    abortRef.current?.abort();
    abortRef.current = null;
    setCandidates([]);
    setSelected(0);
    setMessage('');
    setStatus('idle');
  }, []);

  useEffect(() => { invalidate(); setRegion(FULL); setConsent(false); }, [contextKey, account.sessionId, invalidate]);
  useEffect(() => () => { guard.current.invalidate(); abortRef.current?.abort(); }, []);
  useEffect(() => {
    if (method !== 'hosted') return;
    const controller = new AbortController();
    setHostedAllowed(false);
    setHostedError('Checking hosted availability…');
    getOutlineConfig({ signal: controller.signal, credentials: 'include' }).then(config => {
      if (controller.signal.aborted) return;
      setHostedAllowed(config.configured && config.signedIn && config.allowed);
      setHostedError(config.error);
    }).catch(() => { if (!controller.signal.aborted) setHostedError('Hosted configuration is unavailable. No photo was sent.'); });
    return () => controller.abort();
  }, [method, account.sessionId]);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => { panelRef.current?.focus(); }, []);
  const onDialogKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
    if (event.key !== 'Tab') return;
    const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, a[href]');
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const blocked = method === 'hosted' && (!hostedAllowed || !consent || !subject.trim() || !account.sessionId);
  const run = async () => {
    if (blocked) return;
    invalidate();
    const mine = guard.current.begin();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setMessage('Starting…');
    try {
      const result = method === 'hosted'
        ? await runHostedOutline(image, region, sensitivity, subject, consent, account.sessionId, controller.signal)
        : method === 'trace'
        ? await traceImageEdges(image, region, sensitivity, controller.signal)
        : await runLocalOutline(image, region, sensitivity, controller.signal, text => { if (guard.current.isCurrent(mine)) setMessage(text); });
      if (!guard.current.isCurrent(mine) || controller.signal.aborted) return;
      setCandidates(result);
      setSelected(0);
      setStatus(result.length ? 'ready' : 'empty');
    } catch (error) {
      if (!guard.current.isCurrent(mine) || controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : 'Outline failed.');
      setStatus('error');
    }
  };

  const change = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); invalidate(); setConsent(false); };
  const cancel = () => { guard.current.invalidate(); abortRef.current?.abort(); setStatus('cancelled'); onClose(); };
  const accept = () => {
    const c = candidates[selected];
    if (!c) return;
    guard.current.invalidate();
    setStatus('accepted');
    onAccept(c.points);
  };

  const pt = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = pt(e);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const s = dragStart.current;
    if (!s) return;
    const p = pt(e);
    change(setRegion)({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
  };
  const up = () => {
    dragStart.current = null;
    setRegion(r => (r.width < 0.03 || r.height < 0.03 ? FULL : r));
  };

  const path = candidates[selected]?.points ?? [];
  const poly = path.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="outline-backdrop">
    <section ref={panelRef} tabIndex={-1} onKeyDown={onDialogKey} role="dialog" aria-modal="true" className="outline-panel" aria-label="Outline photo subject" data-testid="panel-outline">
      <div role="radiogroup" aria-label="Outline method" className="outline-methods">
        {METHODS.map(m => (
          <TooltipButton key={m.id} description={m.tip} role="radio" aria-checked={method === m.id}
            className={`button button-small ${method === m.id ? 'button-primary' : ''}`}
            onClick={() => { change(setMethod)(m.id); setConsent(false); }} data-testid={`button-outline-${m.id}`}>{m.label}</TooltipButton>
        ))}
      </div>

      {method === 'hosted' && (
        <div className="outline-blocked" role="alert" data-testid="status-outline-blocked">
          <strong>GPT-Image-2 via Poe:</strong> approximate masks, not guaranteed recognition. Each Run spends one of your shared Poe image requests, even if cancelled after sending.
          <p>Only a downsized copy of this selected photo region is sent to our server, Poe and OpenAI. CloudPainter does not save or log that copy. Poe's privacy center lists OpenAI retention of 30 days; zero retention is not guaranteed. Avoid sensitive photos. <a href="https://poe.com/privacy_center" target="_blank" rel="noreferrer">Provider privacy</a></p>
          {hostedError && <p>{hostedError}</p>}
          <label>Subject to outline <input type="text" maxLength={160} value={subject} onChange={e => change(setSubject)(e.target.value)} placeholder="For example: the dog, or the left cat" data-testid="input-outline-subject" /></label>
          <label className="outline-consent">
            <input type="checkbox" disabled={!hostedAllowed || !account.sessionId} checked={consent} onChange={e => { invalidate(); setConsent(e.target.checked); }} data-testid="checkbox-outline-consent" />
            <span>I consent to sending this photo region to Poe/OpenAI and spending one request. Cancellation cannot guarantee avoiding charges.</span>
          </label>
        </div>
      )}

      <p className="outline-hint">Drag on the photo to choose a region. {region === FULL ? 'Using the full visible photo.' : 'Region selected.'}</p>
      <details><summary>Set region with keyboard</summary>
        {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{key} (%) <input type="number" min={key === 'width' || key === 'height' ? 3 : 0} max={100} value={Math.round(region[key] * 100)} onChange={e => change(setRegion)({ ...region, [key]: Number(e.target.value) / 100 })} /></label>)}
      </details>
      <button type="button" className="button button-small" onClick={() => change(setRegion)(FULL)}>Use full photo</button>
      <div className="outline-preview">
        <img src={image} alt="Visible photo preview" draggable={false} />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Region selection and contour preview" data-testid="svg-outline-preview">
          <rect x={region.x} y={region.y} width={region.width} height={region.height} fill="#d2e67b33" stroke="#315d4d" strokeWidth="0.004" strokeDasharray="0.015 0.01" />
          {poly && <polyline points={poly} fill="none" stroke="#ee806b" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>

      <label className="outline-slider">Sensitivity <span className="control-value">{sensitivity.toFixed(2)}</span>
        <input type="range" className="range-input" min={0.1} max={0.9} step={0.05} value={sensitivity}
          onChange={e => change(setSensitivity)(Number(e.target.value))} data-testid="input-outline-sensitivity" />
      </label>

      <div role="status" aria-live="polite" className="outline-status" data-testid="status-outline">
        {status === 'loading' && `Working… ${message}`}
        {status === 'error' && <span className="generation-error">{message} You can retry.</span>}
        {status === 'empty' && 'No candidates found. Adjust the region or sensitivity and retry.'}
        {status === 'ready' && `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} found. Review the preview, then accept.`}
        {status === 'cancelled' && 'Outline cancelled.'}
        {status === 'accepted' && 'Outline accepted.'}
      </div>

      {candidates.length > 1 && status === 'ready' && (
        <select aria-label="Outline candidate" value={selected} onChange={e => setSelected(Number(e.target.value))} data-testid="select-outline-candidate">
          {candidates.map((c, i) => <option key={i} value={i}>{c.label || `Candidate ${i + 1}`}</option>)}
        </select>
      )}

      <div className="outline-actions">
        <TooltipButton description={blocked ? 'Hosted outlining requires sign-in, configured Poe access, a subject and explicit consent. Disabled accounts cannot make Poe requests.' : 'Find outlines in the selected region. Hosted Run spends a Poe request.'}
          className="button button-primary" disabled={blocked || status === 'loading'} onClick={run} data-testid="button-outline-run">
          {status === 'error' || status === 'empty' ? 'Retry' : 'Run'}
        </TooltipButton>
        <TooltipButton description="Add the previewed outline to your drawing." className="button" disabled={status !== 'ready' || !path.length} onClick={accept} data-testid="button-outline-accept">Accept</TooltipButton>
        <TooltipButton description="Stop any running outline and close this tool." className="button button-quiet" onClick={cancel} data-testid="button-outline-cancel">Cancel</TooltipButton>
      </div>
    </section>
    </div>
  );
}
