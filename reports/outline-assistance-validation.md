# CloudPainter outline assistance — verification

## Behavior

- Outline is disabled on a blank canvas. On a photo, it opens a preview that does not change project data before Accept.
- On-device segmentation used `Xenova/detr-resnet-50-panoptic` in a browser worker. On a public dog fixture, actual inference completed once within the 90-second UI deadline and returned eight labeled dog-boundary candidates. The chosen contour was recognizable; other candidates included extra background contours, so previews remain important.
- The first attempted run exposed a development-only failure: Vite optimized the worker-only Transformers dependency on first use, reloaded the page, and closed the preview. Logs confirmed that no model assets were reached. Startup optimization now prebundles that dependency; a real model run then succeeded. A regression test guards the configuration.
- The worker uses a 512px pixel/preprocessing bound, one WASM thread and a 90-second inference deadline. Its pixels never enter network requests; observed Hugging Face and ONNX asset requests were GETs for the model/runtime only.
- User-directed edge tracing uses local Sobel gradients, recognizes no object names, and receives only a bounded in-memory pixel buffer. Unit tests follow actual edges in portrait and landscape inputs; the same worker algorithm produced bounded paths on both public photo fixtures.
- The local browser check verified preview-only behavior, acceptance onto the selected layer, undo, redo, local autosave, reload restoration, and PNG export. It also verified hosted-mode denial while signed out, resize cancellation, and readable controls at 402×874.

## Hosted mask capability

`GPT-Image-2` returned opaque black/white mask images through Poe's OpenAI-compatible chat API in exactly three paid requests total: one synthetic calibration and the two owner-approved public-photograph tests. No other paid request was made.

- The dog photograph yielded an approximate dog silhouette. The two-cat photo yielded distinct cat silhouettes. Small fur details and gaps were simplified. There are no ground-truth labels for these natural images, so no accuracy percentage is claimed.
- The separate synthetic mask's measured IoU against its generated known mask is 0.9895. Natural-image near-black/white proportions measure encoding only, not segmentation accuracy.
- The production decoder extracted finite contours from all saved masks, retaining separated paths/holes. Hosted output stays a user-reviewed approximation rather than a promise of pixel-exact segmentation.
- The Poe privacy center lists provider-specific retention and 30-day OpenAI retention. The precise API bot retention schedule was not independently verified; zero retention is not claimed. The Poe API documentation says its `store` parameter is ignored.

## Hosted safeguards

- Configuration lookup does not run paid inference. The server requires authenticated and matching session identity, same origin, true explicit consent, a subject description and authorization by the existing owner-approved image spending budget.
- Requests are fixed to the code-owned Poe `GPT-Image-2` entry. No model/provider substitution, retry, arbitrary image URL or durable image upload is used.
- Input image bytes and dimensions, provider response size, image payload format, contour count and contour points are bounded and validated. Disconnect and timeout aborts discard late results and release the request lease. Image bodies and prompts are not logged.
- Automated route tests use injected provider dependencies; the live paid probes verify the Poe model path separately. The signed-out UI path was tested. The signed-in browser happy path was not exercised because no new test account or account-spending approval was created, and the approved paid-test allowance was exhausted.

## Checks completed

| Check | Result |
|---|---|
| `pnpm run typecheck` | Passed |
| `pnpm --filter @workspace/cloudpainter run build` | Passed; Vite shows its existing sourcemap-location and large-chunk advisory warnings |
| `pnpm --filter @workspace/cloudpainter run test:outline` | 8 passed: boundaries, geometry, request invalidation, local privacy, hosted consent, worker startup and edge pixels |
| `pnpm --filter @workspace/cloudpainter run test:outline-ui` | 6 passed: local default, preview/accept/cancel, stale result discard, hosted consent, failures and account changes |
| API outline route tests | 8 passed: session/origin/consent, spending/config gates, output validation, bounded images, masks, cancellation, logging and no persistence |
| Existing `imageDimensions.test.ts` | 5 passed |
| Real saved Poe mask fixtures | Synthetic, dog and cats outputs decoded to finite bounded contours. Public dog/cats photos also yielded eight bounded local edge paths each; no network inference was made for this step. |
| Live local browser path | Actual dog-model inference, preview, accept, undo/redo, autosave, reload restore and PNG export passed once after fixing first-use reload |

The fixture reprocessor and all automated tests are unpaid. Further provider probes require explicit owner approval.
