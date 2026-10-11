import { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft,
  Check,
  Cloud,
  Minus,
  Paintbrush,
  Pencil,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import type { CloudPainterSettings } from '@workspace/api-client-react';
import { useAccountSettings } from '@/components/AccountSettings';

const TEXT_SIZES = [80, 90, 100, 110, 120, 130, 140] as const;
const TOOLS = [
  { value: 'brush', label: 'Brush', detail: 'A balanced, expressive stroke', Icon: Paintbrush },
  { value: 'pencil', label: 'Pencil', detail: 'Fine lines with a light hand', Icon: Pencil },
  { value: 'pen', label: 'Pen', detail: 'A crisp, confident mark', Icon: PenTool },
] as const;
const STYLES = [
  { value: 'round', label: 'Round', detail: 'Smooth edges', className: 'settings-stroke-round' },
  { value: 'chisel', label: 'Chisel', detail: 'Broad angled marks', className: 'settings-stroke-chisel' },
  { value: 'soft', label: 'Soft', detail: 'Feathered edges', className: 'settings-stroke-soft' },
  { value: 'dry', label: 'Dry', detail: 'Textured and broken', className: 'settings-stroke-dry' },
] as const;

export function SettingsPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [, setLocation] = useLocation();
  const { settings, ready, busy, error, expired, signedIn, save, retry } = useAccountSettings();
  const [draft, setDraft] = useState<CloudPainterSettings>(settings);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation('/sign-in', { replace: true });
  }, [isLoaded, isSignedIn, setLocation]);

  useEffect(() => {
    if (ready && signedIn) setDraft(settings);
  }, [ready, signedIn, settings]);

  if (isLoaded && !isSignedIn) {
    return (
      <main className="settings-page" data-testid="settings-redirect-status">
        <div className="settings-redirect" role="status">
          <span className="settings-brand-mark" aria-hidden="true"><Cloud size={19} /></span>
          <p>Taking you to sign in…</p>
          <Link href="/sign-in" data-testid="link-settings-sign-in">Continue to sign in</Link>
        </div>
      </main>
    );
  }

  const update = (changes: Partial<CloudPainterSettings>) => {
    setDraft(current => ({ ...current, ...changes }));
    setSaveMessage('');
    setSaveFailed(false);
  };
  const textIndex = TEXT_SIZES.indexOf(draft.textSize as (typeof TEXT_SIZES)[number]);
  const textSizeIndex = Math.max(0, textIndex);
  const onSave = async () => {
    setSaveMessage('');
    setSaveFailed(false);
    try {
      const saved = await save(draft);
      if (saved) setSaveMessage('Preferences saved to your account.');
      else {
        setSaveFailed(true);
        setSaveMessage('Your preferences could not be saved. Check your connection and try again.');
      }
    } catch {
      setSaveFailed(true);
      setSaveMessage('Your preferences could not be saved. Check your connection and try again.');
    }
  };
  const accountLabel = user?.fullName
    || user?.primaryEmailAddress?.emailAddress
    || user?.username
    || 'CloudPainter account';
  const loading = !isLoaded || !ready || !signedIn;

  return (
    <main className="settings-page">
      <div className="settings-shell">
        <header className="settings-topbar">
          <Link href="/" className="settings-brand" data-testid="link-settings-home">
            <span className="settings-brand-mark" aria-hidden="true"><Cloud size={19} strokeWidth={2.2} /></span>
            <span className="settings-brand-name">Cloud<em>Painter</em></span>
          </Link>
          <Link href="/" className="settings-back-link" data-testid="link-settings-back">
            <ArrowLeft size={15} aria-hidden="true" /> Back to drawing
          </Link>
        </header>

        <section className="settings-heading" aria-labelledby="settings-title">
          <p className="settings-eyebrow"><SlidersHorizontal size={13} aria-hidden="true" /> YOUR WORKSPACE</p>
          <h1 id="settings-title">Settings<span>.</span></h1>
          <p className="settings-lede">Make the workspace feel like yours. These preferences follow your account.</p>
        </section>

        {loading ? (
          <section className="settings-skeleton" aria-label="Loading account settings" data-testid="settings-loading">
            <div className="settings-skeleton-line settings-skeleton-short" />
            <div className="settings-skeleton-line" />
            <div className="settings-skeleton-row"><i /><i /><i /></div>
            <p role="status">Loading your saved preferences…</p>
          </section>
        ) : (
          <>
            <section className="settings-account-strip" aria-label="Signed-in account">
              <span className="settings-avatar" aria-hidden="true">{(user?.firstName || accountLabel).slice(0, 1).toUpperCase()}</span>
              <span className="settings-account-copy">
                <span className="settings-account-label">SIGNED IN AS</span>
                <strong data-testid="text-settings-account">{accountLabel}</strong>
              </span>
              <span className="settings-account-badge"><Check size={12} aria-hidden="true" /> Account</span>
            </section>

            {error && (
              <div className="settings-error" role="alert" data-testid="settings-error">
                <div>
                  <strong>{expired ? 'Your account session has expired.' : 'Settings are unavailable right now.'}</strong>
                  <p>{error}</p>
                  {expired && <Link href="/sign-in" data-testid="link-settings-renew-session">Sign in again</Link>}
                </div>
                <button type="button" className="settings-retry" onClick={() => void retry()} disabled={busy} data-testid="button-settings-retry">
                  {busy ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}

            <div className="settings-layout">
              <nav className="settings-index" aria-label="Settings sections">
                <span className="settings-index-label">PREFERENCES</span>
                <a href="#reading" data-testid="link-settings-reading">01 <span>Reading</span></a>
                <a href="#drawing" data-testid="link-settings-drawing">02 <span>Drawing</span></a>
                <span className="settings-index-note">Saved per account</span>
              </nav>

              <div className="settings-content">
                <section id="reading" className="settings-section" aria-labelledby="reading-title">
                  <div className="settings-section-heading">
                    <span className="settings-section-number">01</span>
                    <div>
                      <h2 id="reading-title">Reading comfort</h2>
                      <p>Adjust interface text without changing your artwork.</p>
                    </div>
                  </div>
                  <div className="text-size-control">
                    <div className="text-size-preview" aria-hidden="true">
                      <span className="text-preview-caption">Aa</span>
                      <span className="text-preview-label">A comfortable canvas<br />starts with clear tools.</span>
                    </div>
                    <div className="text-size-adjust">
                      <div className="settings-control-heading">
                        <label htmlFor="settings-text-size">Interface text size</label>
                        <output htmlFor="settings-text-size" data-testid="value-settings-text-size">{draft.textSize}%</output>
                      </div>
                      <div className="text-size-buttons">
                        <button type="button" aria-label="Decrease text size" onClick={() => update({ textSize: TEXT_SIZES[Math.max(0, textSizeIndex - 1)] })} disabled={textSizeIndex === 0 || busy} data-testid="button-text-size-decrease"><Minus size={16} /></button>
                        <input
                          id="settings-text-size"
                          type="range"
                          min="80"
                          max="140"
                          step="10"
                          value={draft.textSize}
                          aria-label="Interface text size"
                          disabled={busy}
                          onChange={event => update({ textSize: Number(event.currentTarget.value) })}
                          data-testid="input-settings-text-size"
                        />
                        <button type="button" aria-label="Increase text size" onClick={() => update({ textSize: TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, textSizeIndex + 1)] })} disabled={textSizeIndex === TEXT_SIZES.length - 1 || busy} data-testid="button-text-size-increase"><Plus size={16} /></button>
                      </div>
                      <div className="text-size-scale" aria-hidden="true"><span>80%</span><span>140%</span></div>
                      <button type="button" className="settings-reset" onClick={() => update({ textSize: 100 })} disabled={draft.textSize === 100 || busy} data-testid="button-text-size-reset">
                        <RotateCcw size={13} aria-hidden="true" /> Reset to 100%
                      </button>
                    </div>
                  </div>
                </section>

                <section id="drawing" className="settings-section" aria-labelledby="drawing-title">
                  <div className="settings-section-heading">
                    <span className="settings-section-number">02</span>
                    <div>
                      <h2 id="drawing-title">Drawing defaults</h2>
                      <p>Choose the tools that are ready when you start a sketch.</p>
                    </div>
                  </div>

                  <fieldset className="settings-fieldset">
                    <legend>Starting tool</legend>
                    <div className="settings-tool-grid" role="group" aria-label="Starting drawing tool">
                      {TOOLS.map(({ value, label, detail, Icon }) => (
                        <button
                          type="button"
                          key={value}
                          className={`settings-tool-option${draft.drawingTool === value ? ' selected' : ''}`}
                          aria-pressed={draft.drawingTool === value}
                          onClick={() => update({ drawingTool: value })}
                          disabled={busy}
                          data-testid={`button-drawing-tool-${value}`}
                        >
                          <span className="settings-tool-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
                          <span className="settings-option-name">{label}</span>
                          <span className="settings-option-detail">{detail}</span>
                          {draft.drawingTool === value && <Check className="settings-selected-check" size={14} aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="settings-fieldset">
                    <legend>Brush style</legend>
                    <div className="settings-style-grid" role="group" aria-label="Brush style">
                      {STYLES.map(({ value, label, detail, className }) => (
                        <button
                          type="button"
                          key={value}
                          className={`settings-style-option${draft.brushStyle === value ? ' selected' : ''}`}
                          aria-pressed={draft.brushStyle === value}
                          onClick={() => update({ brushStyle: value })}
                          disabled={busy}
                          data-testid={`button-brush-style-${value}`}
                        >
                          <span className={`settings-stroke-swatch ${className}`} aria-hidden="true" />
                          <span className="settings-style-copy"><strong>{label}</strong><small>{detail}</small></span>
                          {draft.brushStyle === value && <Check size={14} aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="settings-brush-size">
                    <div className="settings-control-heading">
                      <label htmlFor="settings-brush-size">Starting brush size</label>
                      <output htmlFor="settings-brush-size" data-testid="value-settings-brush-size">{draft.brushSize} px</output>
                    </div>
                    <input
                      id="settings-brush-size"
                      type="range"
                      min="1"
                      max="48"
                      step="1"
                      value={draft.brushSize}
                      aria-label="Starting brush size, 1 to 48 pixels"
                      disabled={busy}
                      onChange={event => update({ brushSize: Math.max(1, Math.min(48, Math.round(Number(event.currentTarget.value)))) })}
                      data-testid="input-settings-brush-size"
                    />
                    <div className="settings-range-labels"><span>1 px</span><span>48 px</span></div>
                  </div>
                </section>

                <aside className="settings-local-note" data-testid="notice-local-artwork">
                  <span className="settings-local-mark" aria-hidden="true"><Cloud size={17} /></span>
                  <p><strong>Your artwork stays right here.</strong> Photos and drawings remain on this browser. Only these preferences are saved to your account.</p>
                </aside>

                <footer className="settings-save-row">
                  <div className="settings-save-feedback" aria-live="polite">
                    {saveMessage && <span className={saveFailed ? 'is-error' : 'is-success'} role={saveFailed ? 'alert' : 'status'} data-testid="status-settings-save">{saveMessage}</span>}
                    {!saveMessage && !error && <span data-testid="status-settings-idle">Changes are not saved until you choose Save.</span>}
                  </div>
                  <button type="button" className="settings-save-button" onClick={() => void onSave()} disabled={busy || !ready} data-testid="button-settings-save">
                    {busy ? <><span className="settings-save-indicator" aria-hidden="true" /> Saving…</> : <><Save size={16} aria-hidden="true" /> Save preferences</>}
                  </button>
                </footer>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default SettingsPage;
