import { generateOutline, getOutlineConfig } from '@workspace/api-client-react';
import { validOutline, validRegion, MAX_CANDIDATES, type OutlineRegion, type OutlineCandidate } from './outlineGeometry';
export { getOutlineConfig };

/** The only photo-transmission boundary. Never called by local methods. */
export async function runHostedOutline(source: string, region: OutlineRegion, sensitivity: number,
  subject: string, consent: boolean, sessionId: string | null | undefined, signal: AbortSignal): Promise<OutlineCandidate[]> {
  if (!consent || !sessionId) throw new Error('Sign in and explicitly consent before sending photo pixels.');
  if (!validRegion(region) || !subject.trim() || subject.length > 160 || sensitivity < .1 || sensitivity > .9) throw new Error('Choose a valid region, sensitivity and subject.');
  if (!source.startsWith('data:image/png;base64,')) throw new Error('Use only the current local photo preview.');
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(135_000)]);
  const image = new Image();
  const abort = () => { image.src = ''; };
  deadline.addEventListener('abort', abort, { once: true });
  try {
    deadline.throwIfAborted();
    image.src = source;
    await image.decode();
    deadline.throwIfAborted();
    const width = image.naturalWidth * region.width, height = image.naturalHeight * region.height;
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    if (canvas.width < 16 || canvas.height < 16) throw new Error('Select a larger or less narrow region for hosted outlining.');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare an inference copy.');
    context.fillStyle = '#343434';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, image.naturalWidth * region.x, image.naturalHeight * region.y, width, height, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL('image/jpeg', .85).split(',')[1];
    deadline.throwIfAborted();
    const result = await generateOutline({ imageBase64, consent: true, subject: subject.trim(), sensitivity },
      { signal: deadline, credentials: 'include', headers: { 'X-Outline-Session': sessionId } });
    deadline.throwIfAborted();
    if (result.model !== 'GPT-Image-2' || !Array.isArray(result.candidates) || result.candidates.length > MAX_CANDIDATES
      || !result.candidates.every(c => typeof c.label === 'string' && Array.isArray(c.points) && validOutline(c.points))) throw new Error('The server returned invalid contours.');
    return result.candidates.map(c => ({
      label: c.label.slice(0, 80),
      points: c.points.map(p => ({ x: region.x + p.x * region.width, y: region.y + p.y * region.height })),
    }));
  } finally { deadline.removeEventListener('abort', abort); image.src = ''; }
}
