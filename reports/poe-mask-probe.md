# Poe GPT-Image-2 mask-output experiment

## Authorization and scope

The owner requested testing the exact Poe bot `GPT-Image-2`, including its documented
`use_mask` option. One paid, owner-invoked request ran on 2026-10-11 UTC.
No retries, model substitutions, provider fallback, personal photos, catalogue
queries, or production model-list changes were made.

The standalone probe's static registry authorizes only a synthetic image-editing
experiment. It does not grant CloudPainter users access to another image model.

## Method

- Endpoint: `POST https://api.poe.com/v1/chat/completions`.
- Bot documentation: https://poe.com/GPT-Image-2/api.
- Input: a generated 512 × 512 image with an asymmetric orange silhouette,
  an oval background-colored hole, a blue distractor, and a gradient background.
- Request: return the orange subject as white, all other pixels as black,
  keeping the boundaries, hole and field of view unchanged.
- `use_mask` was included in the prompt, as the bot page documents.
- `quality: low` and `aspect: 1:1` were requested as custom parameters. Their
  acceptance cannot be inferred separately from this successful response.
- Deadline: 180 seconds; outer process bound: 210 seconds with five-second
  termination grace. Provider JSON limit: 1 MiB. Image download: existing
  public-address-pinned, redirect-rejecting Poe CDN downloader, maximum 12 MiB.
- Generated images and sanitized measurements are in the ignored
  `generated-artifacts/poe-mask-probe/` directory. No credential, input payload,
  or signed media URL was included in console output or this report.

## Observed result

HTTP 200, one image, approximately nine seconds.

The image is a 1024 × 1024 opaque black-and-white PNG. Visual review confirms
that the orange subject became white, the blue distractor disappeared, and the
oval hole and concavities were preserved.

After resizing the output back to the input grid:

| Measurement | Result |
|---|---:|
| Foreground intersection-over-union against the known mask | 0.9895 |
| Pixels near black or white | 99.33% |
| False-positive foreground pixels | 406 |
| False-negative foreground pixels | 246 |

## Interpretation and limitations

This demonstrates that this exact Poe bot can return a **prompted mask image**
for this synthetic subject. Such an image could be thresholded and its boundary
converted into drawing-layer contour points.

It does **not** establish:

- a dedicated segmentation endpoint or separately named mask output channel;
- that `use_mask` causes mask output, since no keyword-off control was run;
- pixel-exact preservation or dependable performance on natural photographs;
- handling of hair, transparency, low contrast, occlusion, or imagined figures;
- actual Poe point charges or guaranteed enforcement of the requested quality;
- suitable retention terms for uploading users' reference photos.

Additional paid requests require explicit approval.

## Two approved natural-photo tests

The owner separately approved two further paid requests. Both completed on
2026-10-11 UTC, without retries or substitutions:

| Public fixture | Time | Returned mask |
|---|---:|---|
| PyTorch Hub dog.jpg | 11 seconds | 1024-square PNG; dog isolated from grass and plants, including visible fur |
| Hugging Face documentation COCO two-cat sample | 13 seconds | 1024-square PNG; two separate cat silhouettes, sofa and remotes excluded |

Sources:

- https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg
- https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/coco_sample.png

Visual inspection used both mask images and semi-transparent overlays on the
actual 512-square padded inputs. Some small fur details and gaps are simplified;
these are usable approximate outlines, not pixel-exact segmentation guarantees.
No ground-truth annotation was supplied for these photographs, so no numerical
accuracy score is claimed. The reported near-black/white pixel fractions
(98.50% and 98.90%) measure mask format only.

Reprocessing all three saved real outputs with the production mask decoder
produced finite, bounded, ordered contours: two synthetic loops, three dog loops,
and three cat loops (small loops include internal gaps). Natural subject outer
boundaries were sampled to 1,024 points each.

### Privacy evidence

https://poe.com/privacy_center (last updated 2026-04-30) says provider retention
schedules differ and lists OpenAI retention of 30 days. The exact image-bot
API retention schedule was not independently contracted or verified.
The Poe OpenAI-compatible API documentation says `store` is ignored.
Do not claim zero retention or that deleting an ephemeral CloudPainter buffer
deletes copies held by Poe or the downstream provider.

## Reproduction

Only after owner approval for another single paid attempt:

```sh
timeout --signal=TERM --kill-after=5s 210s \
  pnpm --filter @workspace/api-server exec tsx \
  scripts/probe-poe-mask.ts --approved-single-request
```

The script reads the existing server-side `POE_API_KEY`, without printing it.
It never participates in startup, health checks, ordinary tests, or CI.
