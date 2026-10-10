import { useState, type FormEvent } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useGenerateOpenaiImage, type OpenaiImageInput } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Props = {
  onUse: (image: string, prompt: string) => Promise<void>;
};

export function ImageGenerator({ onUse }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<NonNullable<OpenaiImageInput['size']>>('1024x1024');
  const [result, setResult] = useState<{ image: string; prompt: string } | null>(null);
  const [applyError, setApplyError] = useState('');
  const [applying, setApplying] = useState(false);
  const generation = useGenerateOpenaiImage();
  const busy = generation.isPending || applying;

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setApplyError('');
    try {
      const output = await generation.mutateAsync({ data: { prompt: prompt.trim(), size } });
      setResult({ image: `data:image/png;base64,${output.b64_json}`, prompt: prompt.trim() });
    } catch {
      // The mutation error is displayed below, and the current sketch is untouched.
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
            <DialogDescription>Create an image with OpenAI, then draw what you see in it.</DialogDescription>
          </DialogHeader>
          <form onSubmit={generate} className="image-generator-form">
            <label htmlFor="image-prompt">Describe your image</label>
            <textarea id="image-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={1000} rows={4} disabled={busy} placeholder="Soft clouds over a blue sky, with shapes that suggest a sleeping dragon…" required data-testid="input-image-prompt" />
            <label htmlFor="image-size">Image shape</label>
            <select id="image-size" value={size} onChange={event => setSize(event.target.value as NonNullable<OpenaiImageInput['size']>)} disabled={busy}>
              <option value="1024x1024">Square — 1024 × 1024</option>
              <option value="1536x1024">Landscape — 1536 × 1024</option>
              <option value="1024x1536">Portrait — 1024 × 1536</option>
            </select>
            <p className="generation-disclosure">Your prompt is sent to OpenAI through Replit AI Integrations. Generation uses your Replit credits; no API key is needed. Uploaded photos and sketches are not sent.</p>
            <button type="submit" className="button button-primary" disabled={busy || !prompt.trim()} data-testid="button-submit-generation">
              {generation.isPending ? <Loader2 size={15} className="generation-spinner" /> : <Sparkles size={15} />}
              {generation.isPending ? 'Generating… this can take a minute' : result ? 'Generate another image' : 'Generate image'}
            </button>
          </form>
          {generation.isError && <p role="alert" className="generation-error" data-testid="generation-error">{generation.error.data?.error || 'Image generation failed. Please try again later.'}</p>}
          {result && (
            <section className="generated-preview" aria-label="Generated image preview">
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
