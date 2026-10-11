import { validOutline, validRegion, MAX_CANDIDATES, type OutlineCandidate, type OutlineRegion } from './outlineGeometry';
export type { OutlineCandidate, OutlineRegion } from './outlineGeometry';

async function run(mode: 'local' | 'edge', source: string, region: OutlineRegion, sensitivity: number, signal: AbortSignal, onStatus?: (message: string) => void): Promise<OutlineCandidate[]> {
  if (!validRegion(region) || !Number.isFinite(sensitivity) || sensitivity < .1 || sensitivity > .9) throw new Error('Choose a valid region and sensitivity.');
  signal.throwIfAborted();
  const image = new Image();
  if (!source.startsWith('data:image/png;base64,')) throw new Error('Use only the current local photo preview.');
  const decodeAbort = () => { image.src = ''; };
  const decodeTimer = setTimeout(decodeAbort, 15_000);
  signal.addEventListener('abort', decodeAbort, { once: true });
  try {
    image.src = source;
    await image.decode();
    signal.throwIfAborted();
  } finally { clearTimeout(decodeTimer); signal.removeEventListener('abort', decodeAbort); }
  const cropWidth = image.naturalWidth * region.width, cropHeight = image.naturalHeight * region.height;
  const scale = Math.min(1, 512 / Math.max(cropWidth, cropHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot read photo pixels.');
  context.drawImage(image, image.naturalWidth * region.x, image.naturalHeight * region.y, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  image.src = '';
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./outline.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (error?: Error, result?: OutlineCandidate[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new DOMException('Outline cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Inference timed out after 90 seconds. Retry explicitly or choose Trace an edge.')), 90_000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onerror = () => finish(new Error('Could not start the local model worker. Try Trace an edge.'));
    worker.onmessage = event => {
      const message = event.data;
      if (message.status) { onStatus?.(String(message.status)); return; }
      if (message.error) { finish(new Error(String(message.error))); return; }
      if (!Array.isArray(message.candidates) || message.candidates.length > MAX_CANDIDATES
        || !message.candidates.every((candidate: OutlineCandidate) => typeof candidate.label === 'string' && Array.isArray(candidate.points) && validOutline(candidate.points))) {
        finish(new Error('The model returned an invalid outline.')); return;
      }
      finish(undefined, message.candidates.map((candidate: OutlineCandidate) => ({
        label: candidate.label.slice(0, 80),
        points: candidate.points.map(p => ({ x: region.x + p.x * region.width, y: region.y + p.y * region.height })),
      })));
    };
    worker.postMessage({ mode, pixels, width: canvas.width, height: canvas.height, sensitivity }, [pixels.buffer]);
  });
}

export const runLocalOutline = (source: string, region: OutlineRegion, sensitivity: number, signal: AbortSignal, onStatus: (message: string) => void) => run('local', source, region, sensitivity, signal, onStatus);
export const traceImageEdges = (source: string, region: OutlineRegion, sensitivity: number, signal: AbortSignal) => run('edge', source, region, sensitivity, signal);
