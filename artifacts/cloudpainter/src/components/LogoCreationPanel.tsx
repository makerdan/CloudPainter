import { useCallback, useEffect, useRef, useState } from 'react';
import { SignInButton } from '@clerk/react';
import {
  generateLogoImage,
  getGetImageGenerationConfigQueryKey,
  useGetImageGenerationConfig,
} from '@workspace/api-client-react';
import { usePaletteAccount } from './Account';
import './LogoCreationPanel.css';

export type LogoDirectionId = 'cloudline' | 'viewfinder' | 'gesture' | 'paperfold' | 'sunstudy';
export type LogoDirectionOption = { id: LogoDirectionId; number: string; name: string; description: string };

export const PROMPT_MAX = 1200;
export const TIMEOUT_MS = 100_000;
export const MAX_CONCEPTS = 4;
const BASE64_MAX = 11_184_812;

const SAFE_MESSAGES: Record<string, string> = {
  INVALID_INPUT: 'That description could not be used. Adjust it and try again.',
  BODY_TOO_LARGE: 'That description is too long. Shorten it and try again.',
  REFUSED: 'That description could not be turned into a concept. Try different wording.',
  RATE_LIMITED: 'Too many requests right now. Wait a few minutes, then try again.',
  BUSY: 'The image service is busy. Try again shortly.',
  UNAVAILABLE: 'Poe image generation is unavailable. Check the Poe account has points or try again later. The five logo directions and sketch workspace still work.',
  PROVIDER_FAILED: 'The concept could not be created this time.',
  INVALID_IMAGE: 'The service returned an unusable image. Try again.',
  TIMEOUT: 'The concept took too long to create. Try again.',
  unauthorized: 'Your sign-in changed. Sign in again before generating a logo concept.',
  authorization_denied: 'Poe image access is disabled for this account.',
  quota_exhausted: 'The shared Poe request allowance is used for now. Try again after it resets.',
  rate_limited: 'The image service is busy. Wait a few minutes, then try again.',
  budget_unavailable: 'Spending limits could not be checked, so no logo request was sent. Please try again.',
};
const GENERIC = 'The concept could not be created. Please try again.';

type Failure = { message: string; retryable: boolean };

function describeError(error: unknown): Failure {
  const e = error as { status?: unknown; data?: { code?: unknown; retryable?: unknown } | null } | null;
  const code = e?.data && typeof e.data.code === 'string' ? e.data.code : '';
  if (code && Object.prototype.hasOwnProperty.call(SAFE_MESSAGES, code)) {
    return { message: SAFE_MESSAGES[code], retryable: e?.data?.retryable === true };
  }
  if (e?.status === 429) return { message: SAFE_MESSAGES.RATE_LIMITED, retryable: true };
  return { message: GENERIC, retryable: typeof e?.status !== 'number' || e.status >= 500 };
}

export function pngBase64ToBlob(value: unknown): Blob | null {
  if (typeof value !== 'string' || value.length < 16 || value.length > BASE64_MAX) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    const bin = atob(value);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bin.length < 33 || sig.some((b, i) => bin.charCodeAt(i) !== b)) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  } catch {
    return null;
  }
}

type Status = 'idle' | 'generating' | 'error' | 'success';
type Concept = { id: number; url: string };

export function LogoCreationPanel({ logoDirections }: { logoDirections: readonly LogoDirectionOption[] }) {
  const { isLoaded, userId, sessionId } = usePaletteAccount();
  const identity = `${userId ?? ''}:${sessionId ?? ''}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const configuration = useGetImageGenerationConfig({
    query: {
      queryKey: [...getGetImageGenerationConfigQueryKey(), identity],
      enabled: isLoaded,
      staleTime: 0,
      refetchInterval: 30_000,
      retry: false,
    },
  });
  const signedIn = Boolean(userId && sessionId);
  const eligible = Boolean(signedIn && configuration.data?.signedIn && configuration.data.allowed
    && configuration.data.configured && configuration.data.remaining > 0 && configuration.data.globalRemaining > 0);
  const [prompt, setPrompt] = useState('');
  const [direction, setDirection] = useState<LogoDirectionId | ''>('');
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const inFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const conceptsRef = useRef<Concept[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
      for (const concept of conceptsRef.current) URL.revokeObjectURL(concept.url);
      conceptsRef.current = [];
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    inFlight.current = false;
    for (const concept of conceptsRef.current) URL.revokeObjectURL(concept.url);
    conceptsRef.current = [];
    setConcepts([]);
    setPrompt('');
    setDirection('');
    setFailure(null);
    setStatus('idle');
  }, [identity]);

  const trimmed = prompt.trim();
  const tooLong = prompt.length > PROMPT_MAX;
  const validation = !trimmed ? 'Describe the logo concept first.' : tooLong ? `Keep the description within ${PROMPT_MAX} characters.` : '';

  const submit = useCallback(async () => {
    if (inFlight.current || !mounted.current || conceptsRef.current.length >= MAX_CONCEPTS) return;
    if (!trimmed || prompt.length > PROMPT_MAX) {
      setStatus('error');
      setFailure({ message: !trimmed ? 'Describe the logo concept first.' : `Keep the description within ${PROMPT_MAX} characters.`, retryable: false });
      return;
    }
    inFlight.current = true;
    const actor = identity;
    const controller = new AbortController();
    controllerRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    setStatus('generating');
    setFailure(null);
    try {
      const result = await generateLogoImage(
        { prompt: trimmed, ...(direction ? { direction } : {}) },
        {
          signal: controller.signal,
          credentials: 'same-origin',
          headers: { 'X-Logo-Session': sessionId ?? '' },
        },
      );
      if (!mounted.current || actor !== identityRef.current || controller.signal.aborted && !timedOut) return;
      if (timedOut) throw { data: { code: 'TIMEOUT', retryable: true } };
      const blob = result?.width === 1024 && result?.height === 1024 ? pngBase64ToBlob(result.pngBase64) : null;
      if (!blob) throw { data: { code: 'INVALID_IMAGE', retryable: true } };
      const concept = { id: nextId.current++, url: URL.createObjectURL(blob) };
      conceptsRef.current = [...conceptsRef.current, concept];
      setConcepts(conceptsRef.current);
      setStatus('success');
    } catch (error) {
      if (!mounted.current || actor !== identityRef.current) return;
      if (controller.signal.aborted && !timedOut) return;
      setFailure(timedOut ? { message: SAFE_MESSAGES.TIMEOUT, retryable: true } : describeError(error));
      setStatus('error');
    } finally {
      clearTimeout(timer);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        inFlight.current = false;
      }
    }
  }, [trimmed, prompt, direction, identity, sessionId]);

  const remove = (id: number) => {
    const concept = conceptsRef.current.find(item => item.id === id);
    if (!concept) return;
    conceptsRef.current = conceptsRef.current.filter(item => item.id !== id);
    setConcepts(conceptsRef.current);
    URL.revokeObjectURL(concept.url);
    if (!conceptsRef.current.length && !inFlight.current && status === 'success') setStatus('idle');
  };

  const download = (concept: Concept) => {
    const a = document.createElement('a');
    a.href = concept.url;
    a.download = `cloudpainter-logo-concept-${concept.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const busy = status === 'generating';
  const full = concepts.length >= MAX_CONCEPTS;
  const selected = logoDirections.find(d => d.id === direction);
  const liveText = !isLoaded ? 'Checking your account…'
    : !signedIn ? 'Sign in to generate logo concepts.'
    : configuration.data && !configuration.data.allowed ? 'This account cannot currently use Poe image requests.'
    : configuration.isError ? 'Could not check Poe access. Reopen this page to retry.'
    : !configuration.data?.configured ? 'Poe image generation is not configured for this project.'
    : busy ? 'Generating your logo concept. This can take up to a minute and a half.'
    : status === 'error' && failure ? failure.message
    : status === 'success' ? 'Concept ready. Compare your concepts and download any PNG.' : '';

  return (
    <section className="logo-create" aria-labelledby="logo-create-title" data-testid="logo-creation-panel">
       <form onSubmit={e => { e.preventDefault(); void submit(); }} noValidate aria-busy={busy}>
        <p className="eyebrow">Raster exploration</p>
        <h2 id="logo-create-title">Create a logo concept</h2>
        <p className="logo-create-lede">Describe a mark in words and get one square PNG to react to.</p>
         {!isLoaded ? <p role="status">Checking your account…</p> : !signedIn ? (
           <p>Sign in to use Poe for logo generation. You can browse the built-in directions without an account. <SignInButton><button type="button" className="button">Sign in</button></SignInButton></p>
        ) : !configuration.data?.configured && !configuration.isLoading ? (
          <p role="status">Poe is not configured for this project. Logo directions remain available.</p>
        ) : configuration.data?.allowed ? (
           <p role="status">{configuration.data.remaining} of {configuration.data.dailyLimit} account attempts and {configuration.data.globalRemaining} shared attempts remain today. Requests count toward CloudPainter’s shared Poe limits.</p>
         ) : configuration.data ? (
           <p role="status">Poe image access is unavailable for this account. Explicitly disabled accounts remain blocked.</p>
         ) : configuration.isError ? (
           <p role="alert">Could not check Poe access. Reopen this page to retry.</p>
         ) : null}
        <label htmlFor="logo-prompt">Describe the concept</label>
         <textarea id="logo-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} aria-describedby="logo-prompt-count" aria-invalid={tooLong || undefined} disabled={!eligible || busy} data-testid="input-logo-prompt" />
        <div className="logo-create-count" id="logo-prompt-count">
          <span className={tooLong ? 'over' : ''}>{prompt.length} / {PROMPT_MAX}</span>
          {validation && prompt.length > 0 && <span className="over">{validation}</span>}
        </div>
        <label htmlFor="logo-direction">Inspiration direction (optional)</label>
         <select id="logo-direction" value={direction} onChange={e => setDirection(e.target.value as LogoDirectionId | '')} disabled={!eligible || busy} data-testid="select-logo-direction">
          <option value="">No direction</option>
           {logoDirections.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
         {selected && <p className="logo-create-lede" style={{ margin: '7px 0 0' }}>Text-only inspiration: {selected.description}</p>}
        <div className="logo-create-actions">
           <button type="submit" className="button button-primary" disabled={busy || full || !eligible} aria-describedby="logo-gallery-limit" data-testid="button-generate-logo">
             {busy ? 'Generating…' : concepts.length ? 'Generate again' : 'Generate image'}
          </button>
          {status === 'error' && failure?.retryable && trimmed && !tooLong && (
            <button type="button" className="button" onClick={() => void submit()} disabled={busy || full} data-testid="button-retry-logo">Try again</button>
          )}
        </div>
        <div className={`logo-create-status ${status === 'error' ? 'is-error' : ''}`} role={status === 'error' ? 'alert' : 'status'} aria-live={status === 'error' ? 'assertive' : 'polite'} data-testid="status-logo-generation">{liveText}</div>
        <div className="logo-create-notice">
          <ul>
             <li>Your prompt and optional direction text are sent to Poe for image generation, using Poe points.</li>
             <li>Your sketch and reference photo are not sent for logo generation.</li>
            <li>Generated raster concepts cannot replace the live CloudPainter identity, and transparency is not guaranteed.</li>
            <li>Results last only for this visit. Download favorites before leaving this page.</li>
          </ul>
        </div>
      </form>
      <div className="logo-create-result">
        <h3 className="logo-gallery-title" id="logo-gallery-title">Compare concepts</h3>
        <p className="logo-result-caption" id="logo-gallery-limit" data-testid="text-logo-gallery-limit">
          {concepts.length} / {MAX_CONCEPTS} concepts · session only.
          {full ? ' Download a favorite, then remove a concept to generate another.' : ' Up to four previews; none are replaced automatically.'}
        </p>
        {!concepts.length && <div className={`logo-result-frame ${busy ? 'busy' : ''}`} data-testid="logo-result-frame">
          <span>{busy ? 'Sketching your concept...' : 'Your concepts will appear here.'}</span>
        </div>}
        <div className="logo-concept-gallery" role="list" aria-labelledby="logo-gallery-title" data-testid="logo-concept-gallery">
          {concepts.map(concept => <div className="logo-concept-card" role="listitem" key={concept.id} data-testid={`card-logo-concept-${concept.id}`}>
            <div className="logo-result-frame">
              <img src={concept.url} alt={`Generated logo concept ${concept.id}`} width={1024} height={1024} data-testid={`img-logo-result-${concept.id}`} />
            </div>
            <span className="logo-result-caption">Concept {concept.id} · 1024 x 1024 PNG</span>
            <div className="logo-create-actions">
              <button type="button" className="button" onClick={() => download(concept)} aria-label={`Download concept ${concept.id} PNG`} data-testid={`button-download-logo-${concept.id}`}>Download PNG</button>
              <button type="button" className="button" onClick={() => remove(concept.id)} aria-label={`Remove concept ${concept.id}`} data-testid={`button-remove-logo-${concept.id}`}>Remove</button>
            </div>
          </div>)}
        </div>
      </div>
    </section>
  );
}

export default LogoCreationPanel;
