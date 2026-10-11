import { env, pipeline, RawImage } from '@huggingface/transformers';
import { maskContours, MAX_CANDIDATES, type OutlineCandidate } from './outlineGeometry';
import { traceEdges } from './outlineEdges';

// Only static model assets are fetched. Photo bytes are passed into this worker, never a URL.
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;

type Input = { mode: 'local' | 'edge'; pixels: Uint8ClampedArray; width: number; height: number; sensitivity: number };

self.onmessage = async (event: MessageEvent<Input>) => {
  try {
    const input = event.data;
    if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1
      || input.width * input.height > 512 * 512 || input.pixels.length !== input.width * input.height * 4) throw new Error('Image exceeds inference limits.');
    if (input.mode === 'edge') { self.postMessage({ candidates: traceEdges(input) }); return; }
    self.postMessage({ status: 'Downloading/loading local segmentation model… No photo pixels are uploaded.' });
    const segmenter = await pipeline('image-segmentation', 'Xenova/detr-resnet-50-panoptic', {
      device: 'wasm', dtype: 'q8',
    });
    try {
      // The model's default preprocessor enlarges small photos to 800px.
      // Bound the actual inference tensor as well as the original pixel copy.
      const processor = segmenter.processor.image_processor;
      if (!processor) throw new Error('Local image processor unavailable.');
      processor.size = { shortest_edge: 384, longest_edge: 512 };
      processor.pad_size = { width: 512, height: 512 };
      self.postMessage({ status: 'Finding subject masks on this device…' });
      const output = await segmenter(new RawImage(input.pixels, input.width, input.height, 4), {
        threshold: 1 - input.sensitivity, mask_threshold: 0.5,
      });
      const candidates: OutlineCandidate[] = [];
      for (const item of output) {
        // Resample masks to bounded input dimensions before contour extraction.
        const mask = await item.mask.resize(input.width, input.height);
        const bits = new Uint8Array(input.width * input.height);
        for (let i = 0; i < bits.length; i++) bits[i] = mask.data[i * mask.channels] > 127 ? 1 : 0;
        for (const points of maskContours(bits, input.width, input.height)) {
          candidates.push({ label: `${String(item.label)} · boundary ${candidates.length + 1}`, points });
          if (candidates.length === MAX_CANDIDATES) break;
        }
        if (candidates.length === MAX_CANDIDATES) break;
      }
      self.postMessage({ candidates });
    } finally { await segmenter.dispose(); }
  } catch {
    self.postMessage({ error: 'Local inference failed. Check model-download access or try a smaller region or Trace an edge. No hosted fallback was used.' });
  }
};
