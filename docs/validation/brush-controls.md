# Compact brush controls

## Scope and method

The existing Color contents were consolidated without changing color normalization,
drawing, layers, account authentication, or palette transport/persistence.
Independent disclosure buttons keep their contents mounted and use native `hidden`
to exclude closed controls from display and focus. Opening choices last for the
mounted workspace only.

Direct checks were explicitly authorized by the owner for this task after local
governance could not be established. No registered tier or inactive governance is
claimed. Checks reused the existing development preview and system Chromium.
Each batch had an independent shell `timeout` (at most five minutes, with a
five-second termination grace); individual browser suites retain their four-minute
limits. Total checking time remained below fifteen minutes, including retries.
No additional server or paid image request was started.

The baseline preview initially could not resolve the merged Clerk dependencies.
Installing the existing frozen lockfile and restarting the managed preview restored
it without changing dependencies or application code.

## Expanded Color height comparison

Fresh isolated browser state, initial Forest color, no input error, and identical
1440 × 1100 viewport. The desktop Color content width was 206 CSS pixels in both
captures. Measurement starts at the selected-color summary and ends at the first
account row. It excludes the disclosure header and account rows, and does not
count any savings from collapsing sections.

| Expanded guest content | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Desktop | 462 px | 212 px | 54.1% |
| 360px viewport | 350.5 px | 212 px | 39.5% |

The baseline narrow content width was 286px; the final narrow content uses the full
302px available inside its panel. Both captures use a 360px viewport; only the
desktop comparison requires identical content width. Account rows are measured
separately by the capture script. The initial
account-loading row was 17.59px in both desktop captures; hydrated sign-in guidance
and saved-palette rows are not included in the compactness comparison.

`artifacts/cloudpainter/tests/color-layout.capture.mjs before|after` captures both
widths to ignored `generated-artifacts/brush-controls/`. The after capture requires
the before JSON and asserts the desktop width matches and the expanded-content
reduction is at least 25%. Before/after images and JSON, layout screenshots, and
check logs are generated output, not repository assets.

## Checks

- Root `pnpm run typecheck`: passed.
- Color normalization: all three tests passed.
- Palette persistence: all five tests passed.
- Drawing-color browser regression: passed, retaining pixel assertions through
  drawing, undo, redo, reload, and PNG export.
- Added browser assertions cover all 24 presets, selected states, 24px minimum
  targets, hex Apply/Enter, invalid input, native-picker synchronization, eraser
  selection, default/independent disclosures, Enter/Space/touch toggling,
  hidden-focus exclusion, draft/error preservation, and reactive size/opacity
  summaries including layer selection while collapsed.
- Saved-palette disclosure coverage passed using the real component with isolated
  account and transport fixtures: loading, name/rename draft preservation,
  save failure/retry, select, rename, remove, and 360px layout. This does not claim
  a live sign-in or backend ownership test. No backend/authentication code changed.
- Dedicated brush tooltip coverage passed for all headers, preset buttons,
  picker/hex inputs, and Apply, by both hover and keyboard focus.
- Existing photo-tooltip and touch-tooltip checks passed.
- Full `test:photo-card` suite: all 11 tests passed, including cancellation,
  removal, selected-layer clearing, zoom/pan alignment, and mocked image-generation
  checks. The image-generation tests intercept the transport; no paid request runs.
- Desktop and full-page 360px screenshots show working controls without horizontal
  overflow; browser checks assert mobile containment.

## Remaining unrelated tooltip failure

The unfiltered `test:tooltips` run fails in “every workspace button explains its
action by hover and focus, including disabled states” on the existing Generate
image button. Its committed `ImageGenerator.tsx` renders a plain button with no
tooltip wrapper. The failure is not ignored, and the original traversal remains
intact. Brush-specific coverage was added separately so this unrelated failure
does not prevent verifying the changed controls. Repairing other panels was
outside this redesign's scope.

The drawing/export tests that interact with opacity now explicitly open its
disclosure before exercising the original assertions.

## Completion-review repair

The completion review identified accidental substitutions in the cancellation and
Remove photo test baselines in the integrated test file. The actual captured
saved-project baselines, original fixture dimensions/names, and cancellation
zoom/pan setup were restored. The opacity-disclosure expansion and independently
merged clear-layer test remain. Root typecheck, the entire photo-card suite
(11 tests), and the brush drawing/export regression all passed after the repair.
