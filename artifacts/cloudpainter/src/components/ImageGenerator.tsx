import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SignInButton } from '@clerk/react';
import { AccountControls, usePaletteAccount } from './Account';
import { Loader2, Sparkles } from 'lucide-react';
import { useGeneratePoeImage, useGetImageGenerationConfig, getGetImageGenerationConfigQueryKey, PoeImageInputModel, type PoeImageInput } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Props = {
  onUse: (image: string, prompt: string) => Promise<void>;
};

export function ImageGenerator({ onUse }: Props) {
  const { userId, sessionId, isLoaded } = usePaletteAccount();
  const isSignedIn = Boolean(userId);
  const identity = `${userId ?? ''}:${sessionId ?? ''}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<PoeImageInput['model']>('Nano-Banana-Pro');
  const [result, setResult] = useState<{ image: string; prompt: string; model: PoeImageInput['model'] } | null>(null);
  const [applyError, setApplyError] = useState('');
  const [applying, setApplying] = useState(false);
  const generation = useGeneratePoeImage({ mutation: { retry: false } });
  const configuration = useGetImageGenerationConfig({ query: { queryKey: [...getGetImageGenerationConfigQueryKey(), identity], enabled: open && isLoaded, staleTime: 0, refetchInterval: open ? 30_000 : false, retry: false } });
  const configured = configuration.data?.configured === true;
  const eligible = Boolean(isSignedIn && configuration.data?.signedIn && configuration.data?.allowed && configuration.data.remaining > 0 && configuration.data.globalRemaining > 0);
  const busy = generation.isPending || applying;

  useEffect(() => {
    setResult(null);
    setPrompt('');
    setApplyError('');
    generation.reset();
  }, [identity]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy || !configured || !eligible) return;
    const actor = identity;
    setApplyError('');
    try {
      const output = await generation.mutateAsync({ data: { prompt: prompt.trim(), model } });
      if (actor === currentIdentity.current) setResult({ image: `data:${output.mime};base64,${output.b64_json}`, prompt: prompt.trim(), model });
    } catch {
      // The mutation error is displayed below, and the current sketch is untouched.
    } finally {
      void configuration.refetch();
    }
  }

  async function useImage() {
    if (!result || busy) return;
    setApplying(true);
    setApplyError('');
    try {
      await onUse(result.image, result.prompt);
      setOpen(false);
    } catch {
      setApplyError('This image could not be opened. Your current sketch has not changed.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <button type="button" className="button ai-image-button" onClick={() => { generation.reset(); setApplyError(''); setOpen(true); }} data-testid="button-generate-image">
        <Sparkles size={14} /> Generate image
      </button>
      <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
        <DialogContent className="image-generator" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Imagine a starting point</DialogTitle>
            <DialogDescription>Create an image through Poe, then draw what you see in it.</DialogDescription>
          </DialogHeader>
          {!isLoaded ? <p role="status">Loading your account…</p> : !isSignedIn ? (
            <div><p>Sign in with an approved account to spend the connected Poe account’s points. You can still draw without signing in.</p><SignInButton><button type="button" className="button button-primary">Sign in</button></SignInButton></div>
          ) : <AccountControls />}
          {isSignedIn && configuration.data && !configuration.data.allowed && <p role="status">This account is not approved to generate images. Ask the project owner for access.</p>}
          {isSignedIn && configuration.data?.allowed && <p role="status">{configuration.data.remaining} of {configuration.data.dailyLimit} account attempts remaining today; {configuration.data.globalRemaining} of 20 shared attempts remaining. Resets at midnight UTC. Failed or timed-out attempts count and are never retried automatically.</p>}
          <form onSubmit={generate} className="image-generator-form">
            <label htmlFor="image-prompt">Describe your image</label>
            <textarea id="image-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={1000} rows={4} disabled={busy || !eligible} placeholder="Soft clouds over a blue sky, with shapes that suggest a sleeping dragon…" required data-testid="input-image-prompt" />
            <label htmlFor="image-model">Poe model</label>
            <select id="image-model" value={model} onChange={event => setModel(event.target.value as PoeImageInput['model'])} disabled={busy} data-testid="select-image-model">
              {Object.values(PoeImageInputModel).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <p className="generation-disclosure">Your prompt is sent only to the selected model through Poe and uses the connected Poe account's points. Uploaded photos and sketches are not sent. Avoid confidential information. No other model or provider will be substituted.</p>
            {!configured && <p role="status" className="generation-disclosure">{configuration.isLoading ? 'Checking Poe connection…' : configuration.isError ? 'Could not check the Poe connection. Close and reopen this window to retry.' : 'Poe is not configured. The project owner must add or link POE_API_KEY in Secrets.'}</p>}
            <button type="submit" className="button button-primary" disabled={busy || !prompt.trim() || !configured || !eligible} data-testid="button-submit-generation">
              {generation.isPending ? <Loader2 size={15} className="generation-spinner" /> : <Sparkles size={15} />}
              {generation.isPending ? 'Generating… this can take a minute' : result ? 'Generate another image' : 'Generate image'}
            </button>
          </form>
          {generation.isError && <p role="alert" className="generation-error" data-testid="generation-error">{generation.error.data?.error || 'Image generation failed. Please try again later.'}</p>}
          {result && (
            <section className="generated-preview" aria-label="Generated image preview">
              <p>Generated with {result.model} through Poe.</p>
              <img src={result.image} alt={result.prompt} data-testid="generated-image-preview" />
              <p>Using this image starts a new sketch and replaces the current photo and drawing layers. Your current project stays unchanged until you choose it.</p>
              <button type="button" className="button button-primary" onClick={useImage} disabled={busy} data-testid="button-use-generated-image">{applying ? 'Opening image…' : 'Use image as reference'}</button>
            </section>
          )}
          {applyError && <p role="alert" className="generation-error">{applyError}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
