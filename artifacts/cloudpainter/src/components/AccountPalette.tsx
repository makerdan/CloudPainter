import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPalette, savePalette } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { PalettePersistence } from '@/lib/palettePersistence';
import { usePaletteAccount } from './Account';
import { TooltipButton } from './tooltip-button';

export function AccountPalette({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const { isLoaded, userId, sessionId } = usePaletteAccount();
  if (!isLoaded) return <p className="palette-note">Loading account… You can still draw.</p>;
  if (!userId || !sessionId) return <p className="palette-note"><Link href="/sign-in">Sign in</Link> to save named colors across devices. Custom colors work without an account.</p>;
  // Unmount private state immediately, rather than clearing it in a later effect.
  return <PersonalPalette key={`${userId}:${sessionId}`} color={color} onChange={onChange} sessionId={sessionId} />;
}
function PersonalPalette({ color, onChange, sessionId }: { color: string; onChange: (color: string) => void; sessionId: string }) {
  const [store] = useState(() => new PalettePersistence({
    load: signal => getPalette({ signal, headers: { 'X-Palette-Session': sessionId }, credentials: 'same-origin' }),
    save: (palette, signal) => savePalette(palette, { signal, headers: { 'X-Palette-Session': sessionId }, credentials: 'same-origin' }),
  }));
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  useEffect(() => { void store.load(); return () => store.dispose(); }, [store]);
  // Explicit refresh on focus, only if no pending user change can be discarded.
  useEffect(() => {
    const refresh = () => { if (!store.state.busy && !store.state.pending && !editId) void store.load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [store, editId]);
  const disabled = state.busy || !state.palette || !!state.pending || state.expired || state.conflict;
  return <section className="personal-palette" aria-label="Your account palette">
    <h3 className="color-group-label">My account palette</h3>
    <p className="palette-note">Saved to your account • up to 64 colors. Photos and projects stay in this browser.</p>
    <p className="palette-note" role="status">{state.busy ? (state.pending ? 'Saving palette…' : 'Loading palette…') : state.palette && !state.error ? 'Palette saved to your account' : ''}</p>
    {state.error && <div role="alert" className="palette-error"><p>{state.error}</p>
      {state.expired ? <Link href="/sign-in">Sign in again</Link> : <>
        {!state.conflict && <TooltipButton className="button button-small" disabled={state.busy} description="Retry loading or saving the palette without changing your drawing." onClick={() => void store.retry()}>Retry</TooltipButton>}
        {state.palette && <TooltipButton className="button button-small" disabled={state.busy} description="Discard the failed palette change and reload the latest saved colors. Your drawing is unchanged." onClick={() => void store.load()}>Reload saved palette</TooltipButton>}
      </>}
    </div>}
    {state.palette?.colors.map(swatch => <div className="palette-item" key={swatch.id}>
      <TooltipButton className="swatch" style={{ background: swatch.hex }} aria-label={`Use ${swatch.name} (${swatch.hex.toUpperCase()})`}
        description={`Draw with your saved color ${swatch.name} (${swatch.hex.toUpperCase()}).`} onClick={() => onChange(swatch.hex)} />
      <span>{swatch.name}</span>
      <TooltipButton className="button button-small" disabled={disabled} aria-label={`Rename ${swatch.name}`} description={`Change the account palette label for ${swatch.name}.`}
        onClick={() => { setEditId(swatch.id); setName(swatch.name); }}>Rename</TooltipButton>
      <TooltipButton className="button button-small" disabled={disabled} aria-label={`Remove ${swatch.name}`} description={`Remove ${swatch.name} from your account palette; existing strokes are unchanged.`}
        onClick={() => void store.save(state.palette!.colors.filter(c => c.id !== swatch.id))}>Remove</TooltipButton>
    </div>)}
    {state.palette && state.palette.colors.length === 0 && <p className="palette-note">No saved colors yet.</p>}
    <form className="hex-color-form" onSubmit={event => {
      event.preventDefault();
      if (disabled || !name.trim() || !state.palette) return;
      const colors = editId
        ? state.palette.colors.map(c => c.id === editId ? { ...c, name: name.trim() } : c)
        : [...state.palette.colors, { id: crypto.randomUUID(), name: name.trim(), hex: color }];
      void store.save(colors);
      setName(''); setEditId(null);
    }}>
      <label htmlFor="palette-color-name">{editId ? 'Rename saved color' : 'Name the current color'}</label>
      <div className="hex-color-entry"><input id="palette-color-name" value={name} maxLength={40} required
        onChange={event => setName(event.target.value)} disabled={disabled} placeholder="e.g. Pine green" />
        <TooltipButton className="button" type="submit" disabled={disabled || !name.trim() || (!editId && state.palette?.colors.length === 64)}
          description={editId ? 'Save the new name to your account palette.' : `Save the current drawing color (${color.toUpperCase()}) with this name to your account.`}>{editId ? 'Save name' : 'Save color'}</TooltipButton></div>
      {editId && <TooltipButton className="button button-small" type="button" description="Cancel renaming this saved color." onClick={() => { setEditId(null); setName(''); }}>Cancel rename</TooltipButton>}
    </form>
  </section>;
}
