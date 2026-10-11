# Pencil and Pen validation

## Authorization and boundaries

The owner selected **Authorize checks; Failure Gate inactive for this task**.
This is scoped authorization, not project-wide gate activation or bypass.
Discovery found canonical skill instructions but no local active tier registry,
checked runner or authoritative project-wide activation policy.

Run the canonical root typecheck, focused drawing-tool/renderer tests, existing
image-dimension tests and isolated browser replay/export checks against the
existing preview. No new server, database writes, paid inference or user-session
changes. Five minutes maximum per check, fifteen minutes cumulative.

`artifacts/cloudpainter/tests/run-instrument-checks.py` supervises owned child
trees independently, uses Linux subreaper adoption and monotonic deadlines,
reserves cleanup time, caps output and verifies termination. Its original
deadline persists across reentry in ignored `generated-artifacts/`.
This cooperative local route is not protected Failure Gate evidence.

## Commands

From the repository root:

```sh
python3 artifacts/cloudpainter/tests/run-instrument-checks.py typecheck drawing-tools renderer image-dimensions
CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" python3 artifacts/cloudpainter/tests/run-instrument-checks.py browser
```

The browser config uses one worker, zero retries, sixty-second cases, a
four-minute suite deadline, and the running preview without starting a server.
It includes existing brush-style regressions. Isolated contexts verify taps on
phones, distinct tool states, color selection, per-instrument sizes, retained
brush style, legacy drawings, actual canvas pixels through history/reload, source
photo and other-layer eraser isolation, and decoded downloaded PNG composition.

## Compatibility contract

Old `tool: "pen"` records without instrument metadata retain the original round
or recorded brush-style recipe. New brushes record `tool: "brush"`; pencil and
ink strokes store their instrument kind, recipe version and texture seed.
Settings never mutate stored strokes. Color selection preserves drawing tools;
from eraser it returns to the last drawing instrument.

## Results

- Canonical root typecheck passed across all workspace packages.
- Drawing-tool tests: 8 passed. Existing stroke-renderer tests: 11 passed.
  Existing image-dimension tests: 5 passed. No skips or cancellations.
- Existing desktop and phone brush cases passed. The new desktop case passed,
  including exact restored/exported pixels, stored metadata, remembered sizes,
  retained brush style, all color-entry paths and eraser isolation.
- The first new phone case failed in its assertion before debounced local storage
  existed. The null-safe assertion now waits for autosave; a focused phone rerun
  passed. The initial raw failure remains in the supervision log.
- A focused desktop rerun also passed with an additional actual-pixel assertion:
  pencil marks are translucent while ink has alpha 255.
- Initial supervised commands consumed under one minute total execution, within the
  original fifteen-minute cumulative deadline. All owned trees were verified
  quiescent; no timeouts, baseline ignores or waivers were used.
- The refreshed mobile preview showed all four labeled instruments with no
  horizontal overflow or application runtime errors.

Raw command records and logs are in ignored
`generated-artifacts/instrument-validation/`. The updated older color, palette
fixture and tooltip assertions reflect the intended default Brush/last-tool
contract; those separate suites were not run by this scoped validation.

## Completion repair and expanded verification

Completion review exposed malformed fragments in the integrated general
`App.test.tsx`, outside the original instrument diff. History comparison found
unrelated ordering/rename fixture substitutions and helpers in other tests.
Restored the valid photo, clearing, deletion and rename baselines while retaining
the subsequent same-photo and independent-history additions. Recovered the
intended ordering assertions as a standalone test instead of leaving them
interleaved with other cases. Application behavior was not changed by the repair.

The standard `test:photo-card` command loaded and executed all 33 cases:
26 general application regressions and the anonymous image-generation case
passed. Six signed-in image-generation cases failed at their configuration
guard because `CLOUDPAINTER_AUTH_STATE` was unavailable. These are blocked
authentication-fixture checks, not a clean combined-suite pass or a waiver.
No sign-in state was fabricated, and no paid generation was requested.
The supervisor now refuses that combined launch before execution when its
required storage-state file is missing.

After this repair, the complete instrument browser suite passed all four cases
in one run. All supervision records report owned-tree quiescence. Total command
execution, including the failed initial phone assertion and combined-suite
configuration failures, was under four minutes within the original cumulative
deadline. Raw failures remain recorded alongside later successful checks.
