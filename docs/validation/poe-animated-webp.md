# Animated WebP generated-image regression checks

## Scope and authorization

The owner approved bounded local validation for the animated WebP test task,
with Failure Gate inactive for this operation only: five minutes per command
and fifteen minutes cumulative, including setup, cleanup and retries.
No paid inference, persistence changes, remote workflows, new listeners or
live-service changes were involved.

Only synthetic in-memory rasters and injected credentials, provider transport
and downloads are used. Production media helpers, their synchronous header
validation contract, model allowlist and persistence are unchanged.

## Coverage and outcomes

- Valid two-frame WebP: distinct decoded frames, complete pixels, exact original
  bytes and `image/webp` MIME through both `decodePoeMedia` and `generatePoeImage`.
- Corrupt later-frame entropy: headers and metadata remain readable and the
  first frame decodes identically to the valid fixture. All-frame pixel decoding
  rejects the image; generation returns the existing safe `upstream_error`/502.
- Aggregate pixels: two valid frames totaling exactly 20,000,000 pixels pass;
  20,008,000 fail despite legal individual frames and decoded dimensions.
  The over-limit animation independently decodes under a larger fixture-only cap.
- Each generation scenario asserts one injected Poe completion, the selected
  approved model, and one injected download.

The full existing suite ran using `pnpm --filter
@workspace/integrations-openai-ai-server exec node --import tsx --test
--test-timeout=10000 tests/poe-image.test.ts`. The existing Linux subreaper
supervisor's functions were reused in memory with a separate ignored budget/log
directory, without editing its command map or another task's budget.
Limits were 270 seconds execution, 20 seconds owned-descendant cleanup,
30 seconds reserved for cleanup/capture, and a one-megabyte output cap.

The first run passed 32/33: damaging the second frame tag made metadata itself
reject, so it did not prove later-pixel decoding. Moving corruption into the
entropy stream preserved metadata and first-frame usability. The final run
passed 33/33, with no skipped or cancelled tests. Both runs confirmed owned
descendants quiescent and consumed about nine seconds total.
Raw logs, outcomes and the unchanged cumulative deadline are under ignored
`generated-artifacts/animated-webp-validation/`.
