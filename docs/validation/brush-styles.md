# Brush-style validation

## Implemented scope

Solid round, flat/chisel, soft and dry styles; labeled controls with shared-renderer
previews; optional per-stroke version/style/seed metadata; original metadata-free
round drawing and erasing; fixed-count soft/dry passes rather than distance-based
stamp generation. Persistence, undo/redo and PNG composition retain stroke-local
metadata and use the existing layer canvases.

## Approval and supervision

Initial governance was unknown: the canonical Failure Gate guide exists, but
inspection found no authoritative activation decision, capability manifest,
task-to-tier binding or checked local runner. No tier was invented.

The owner explicitly selected **Authorize bounded local checks**, confirming
Failure Gate inactive for this operation, with verified timeout supervision,
five minutes per check and fifteen minutes cumulative. This is scoped approval,
not a project-wide policy change or gate installation.

The approved local equivalent used an independent Python parent supervising the
Node/pnpm processes, Linux child-subreaper adoption and recursive owned-descendant
tracking. It enforces monotonic deadlines and a one-megabyte streaming output cap,
reserves bounded termination/capture time, and confirms the owned process tree is
quiescent before moving on. Its disposable code and raw logs/results live in ignored
`generated-artifacts/brush-validation/`. Reentry shares the original cumulative
deadline file, without replenishment. This is cooperative local supervision, not
protected authorization storage or hostile-process containment.

## Executed local checks

Use existing pnpm scripts, serially, without a second development server.
Apply an independent outer supervisor to each complete owned command tree;
five-minute maximum per check, fifteen-minute cumulative operation maximum,
including setup, cleanup and capture. Reserve thirty seconds for cleanup/capture.
Do not reset cumulative consumption on failure/reentry. Stop on deadline or
unknown descendant termination and preserve partial output.

1. `pnpm run typecheck` — canonical root contract, narrowed to 100 seconds.
2. `pnpm --filter @workspace/cloudpainter run test:stroke-renderer` — up to
   30 seconds; explicit one-second unit test limits and ten-second runner limit,
   no hooks. Exact legacy operations, deterministic replay, per-stroke isolation,
   distinct recipes and bounded pass counts.
3. Existing image-dimension fixtures with a finite Node runner limit:
   `pnpm --filter @workspace/cloudpainter exec node --experimental-strip-types --test --test-timeout=10000 src/lib/imageDimensions.test.ts`
   — narrowed to 30 seconds, no hooks. Existing script's test file and assertions unchanged.
4. `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" pnpm --filter @workspace/cloudpainter run test:brushes-browser`
   — narrowed to 100 seconds; existing preview, isolated browser storage, no paid calls,
   one worker, zero retries, sixty-second cases, five-second assertions.
   Browser context teardown runs in `finally`; independent whole-tree termination
   must also cover browser/helper processes.

Node runner-flag support was confirmed from the installed runtime's help before
test dispatch. The independent supervisor, not the shell tool's timeout alone,
bounded execution and verified owned-tree quiescence. Local raw result/log writes
were acknowledged by successful filesystem writes; no protected central evidence
service is claimed.

## Evidence and acceptance

Renderer tests live at `artifacts/cloudpainter/src/lib/strokeRenderer.test.ts`.
Preview pixel checks live at `artifacts/cloudpainter/src/BrushStyles.test.tsx`;
their config is `artifacts/cloudpainter/playwright.brush.config.ts`.
Browser outputs go to ignored `generated-artifacts/cloudpainter-brushes/`.

Accept only all required checks passing within their original limits. Compare
actual canvas pixels before/after style changes, undo/redo, reload and decoded PNG
export. Confirm the legacy layer is unchanged after erasing the added layer, plus
phone tap drawing, selection and horizontal overflow. Retain raw failures instead
of treating the added assertions or a screenshot as proof they passed.

## Results

- Canonical root typecheck: passed, including a final pass after the test correction.
- Renderer: all eleven tests passed, no skips/cancellations.
- Existing image-dimension fixtures: all five passed, no skips/cancellations.
- Phone browser case: passed on the first run.
- Desktop browser case: first failed because the fourth synthetic mouse stroke
  was outside the viewport (y > 1000). The test now scrolls the canvas into view
  and recalculates its bounds after selecting each preset. The focused desktop
  rerun passed, covering style selection, exact pixels after undo/redo and reload,
  decoded PNG equality, and selected-layer eraser isolation.
- All launched commands had raw zero exits except that retained first browser
  failure. No command timed out; every supervised owned process tree was quiescent.
  Initial checks plus the focused rerun and final typecheck consumed less than
  ninety seconds of the original fifteen-minute cumulative budget.
- Existing preview rendered the four labeled previews and active style without
  runtime errors. Declared dependencies initially missing from the installation
  were restored using the existing frozen lockfile, with no declared version or
  authentication-code changes.

No baseline ignore or waiver was created. The failed initial browser result is
retained rather than relabeled as a passing run.
