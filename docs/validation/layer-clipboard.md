# Layer drawing clipboard validation

## Authorization

The owner selected “Authorize checks; Failure Gate inactive for this task.”
No active project-local gate registry or checked task policy was found.
This scoped approval covers root typecheck, clipboard/history/rendering tests,
existing image-dimension tests and isolated preview replay/reload/export checks.
No paid inference, database changes, new servers or user-session changes.
Five minutes per check and fifteen minutes cumulative are the maximums.

## Bounded route

The existing independent Linux subreaper supervisor has a clipboard mode with
its own original monotonic deadline and restricted command map. Reentry does
not reset the budget. Output is capped; cleanup is reserved and owned descendant
termination is verified. This is cooperative local supervision, not Failure Gate
activation or protected task evidence.

```sh
python3 artifacts/cloudpainter/tests/run-instrument-checks.py --clipboard typecheck clipboard renderer image-dimensions
CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" python3 artifacts/cloudpainter/tests/run-instrument-checks.py --clipboard clipboard-browser
```

Typecheck has a 150-second limit; each Node suite has a 30-second outer limit
and a 10-second test timeout. Browser checks have a 270-second outer limit,
240-second suite timeout, 60-second test timeout, one worker and no retries.
The supervisor reserves 30 seconds before launch for cleanup/capture; cleanup
is at most 20 seconds. Logs and unchanged deadline records are under ignored
`generated-artifacts/clipboard-validation/`.

## Compatibility

Existing stroke records are unchanged. A paste adds one `{kind: "paste",
entries: [...]}` drawing action to the destination's existing history. Each
group renders onto transparent scratch space before compositing; nested groups
retain their eraser isolation. Clipboard copies and paste instances have no
shared mutable drawing data. Layer settings and photos are excluded.

Clipboard contents last only for the open sketch session. Reloading or opening
another sketch clears the clipboard; deleting or editing its source layer does
not. Pasted groups and redo history persist through existing browser saving and
recovery. Export uses the same rendered layer canvases as the workspace.

## Results

- Canonical root typecheck passed for all workspace packages.
- Six clipboard/history tests, eleven existing renderer tests and five existing
  image-dimension tests passed, with no skipped or cancelled cases.
- Three isolated browser regressions passed: exact mixed-tool canvas pixels,
  preserved destination pixels under a copied eraser, source edits/deletion,
  repeated and nested copies, atomic undo/redo, persisted redo after reload,
  ordinary drawing history, decoded downloaded PNG pixels, invalid selection
  handling and phone controls with no horizontal overflow.
- The initial typecheck and browser run failed because the declared
  `@workspace/outline-core` dependency had not been linked in either artifact.
  A frozen-lockfile pnpm install restored existing dependencies without changing
  the lockfile or application source. Offline installation could not obtain
  uncached packages; the normal install succeeded. Both affected workflows
  restarted cleanly, and the blocked checks then passed. Original raw failures
  remain in the supervision records; none were ignored or reclassified as passes.
- Total supervised check execution, including initial failures, was approximately
  fifty seconds, within the original fifteen-minute deadline. Every run verified
  owned descendant quiescence; there were no timeout or output-cap incidents.
- The final preview screenshot showed labeled Copy drawing/Paste drawing controls
  in their empty disabled state and no application runtime error.
- Integration preserved the incoming storage-estimate warnings, guarded sketch
  replacement and printer-safe PDF margins. The canonical root typecheck passed
  again on the combined source, and the frontend workflow restarted cleanly.

## Completion repair

Completion review exposed damaged incoming fixtures in `ImageGenerator.test.tsx`:
a fixture factory had been replaced by a project value, framing assertions had
been substituted with unrelated legacy-recovery assertions, and orphaned
page-dependent statements appeared outside any test. Restored the intended
fixtures/assertions, removed the orphaned statements, and separated the storage
warning test from the provider-failure test. No image-generation application
behavior changed.

The normal `test:photo-card --list` loaded all 56 tests in its three files.
All seven anonymous image-generation/recovery tests passed under the existing
normal Playwright configuration, including repaired framing fixtures, source
history preservation, deletion and legacy recovery.

The signed-in provider-stubbed cases were not executed: the required
`CLOUDPAINTER_AUTH_STATE` file is unavailable. The separate recovery command
explicitly selects the available anonymous cases; neither test discovery nor
this selected pass is claimed as a passing full signed-in suite. No test was
removed or marked skipped. These additional commands share the original
clipboard supervisor deadline and limits; no budget was reset.
