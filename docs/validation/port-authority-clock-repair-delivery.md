# Port Authority clock repair integration — PASS after approved amendment

## Contract and admission

- Native task: #50, inspected as IN_PROGRESS through host readback.
- New provisioned ID: `FGU-d889655a-2deb-421c-98bf-a5141e2d04d3`.
- Initial sealed revision: `2fb531e4823f80a529ec0c2e80fb636184a87c53e7792e3e60841b45605c96dd`.
- Current amended revision: `7030101d712c89b4c3d739443ff034346fb49de43d63f6ff3720004e423c5ec2`.
- Plan: `.local/tasks/FGU-d889655a-2deb-421c-98bf-a5141e2d04d3.md`.
  Exact sealed bytes are also delivered in the native task's Unified dispatch payload.
- Exactly one tier: `test-fast`; definition hash
  `3654894ad3528e331f7167659674db3f102e5b20c4a2fb77a69531f021f16afc`.
  Unchanged limits: 60,000 ms per step, 120,000 ms total, 5,000 ms cleanup.
- Current canonical Unified pin actually observed:
  `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`.
  This had already superseded the planning snapshot's pin. No pin was changed here.
- Current adopted Regression Guard:
  `6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1`,
  with unified-v4 assessment, canonical reference verification and explicit
  bound-workload inclusion. Its application task #49 was observed MERGED.
  Neither it nor task #46 was edited.
- Classification: bug-fix, error-handling, concurrency-lifecycle and
  performance-reliability, normal guard; no installation-title exemption.
- Baseline read and validated through the project reader: schema 1, zero entries.
  No ignored/owned failure declarations. Empty catalog is not a clean test result.
- Provisioning used `node scripts/new-plan.mjs
  .local/tasks/port-authority-clock-current.spec.json`.
  The native task preserved its original approved scope and received an exact
  seal payload through supported host update/readback, not an approval receipt.
- `node scripts/validate-task-plans.mjs` and
  `node scripts/check-unified-preflight.mjs "$UNIFIED_TASK_ID"` both succeeded
  before installation and again before the full tier run, with actual ID, plan
  and observed native context set. Local preflight explicitly does not observe
  host approval/lifecycle; the executor separately inspected both and found
  the owner-approved exact integration/focused-proof scope applicable.
- After the initial failure below, the owner explicitly answered **Approve the
  private fixture correction**. The supported same-ID amendment recorded that
  authorization applicability and evidence impact, preserved the initial failure
  and bound the same tier. The amended exact seal was updated into the native
  payload and read back in full. Admission and current host lifecycle/scope
  checks were repeated before the private correction and full-tier execution.

## Source parity and implementation

Approved ZIP:
`attached_assets/port-authority-clock-test-repair_1792370288101.zip`.
SHA-256:
`9ea10f440242655f9a0bfa800e7cf803602186365de243ed2356c191111f3098`.

Before installation, independently reverified CRC integrity, 34 unique
normalized relative regular members, no traversal/backslash/symlink members,
33 manifest hashes and complete membership. `PACKAGE-MANIFEST.json` is the sole
self-excluded member, pinned by the ZIP. The canonical folder had six files,
all names present in this package, so no older extra variant was retained.
Only exact ZIP members were installed; no runtime mirror supplied source.

The bound proof independently repeated ZIP integrity/path/hash verification,
compared **all 34 installed files byte-for-byte**, required exact installed
membership and no symlinks, and checked canonical SKILL SHA-256:
`b495c93a5fe9495d396fb8615a1cca6eaf66d01244072f05ff58790406102717`.
Manifest SHA-256:
`c7f64555b5eca5e7440768a561b17a16620840d073a63c553e9bdd2818fb42a7`.

All four runtime modules and both test modules passed `node --check` **inside**
the admitted step. The step copied exact package files to an ignored private
snapshot and executed the original hardening module, including its original
core-module import, with an anchored ten-case name pattern.

There are two disclosed private harness changes: replace the hardening helper's
unconditional recursive deletion with retention/logging when its lease remains;
and, after the explicit owner approval, give only the execution-budget case's
replacement waiter an 8000 ms queue limit instead of inherited 5000 ms.
Exact source anchors and uniqueness assertions restrict that correction to one
waiter in one case. The first workload's 5000 ms limit, all assertions, the
three phase-specific case bodies and all installed bytes remain unchanged.
The core hook already retains uncertain leases.
Initial startup/queue retained fixtures were `/tmp/port-authority-regression-pFu82W`
and `/tmp/port-authority-regression-qFQjnA`; final retained fixtures were
`/tmp/port-authority-regression-QDzJKV` and `/tmp/port-authority-regression-8pp01h`.
These uncertain private leases were not deleted.

The package's optional `--supervised` 180-second author runner was not invoked.
The child has a 52-second observation cap under the unchanged Unified step and
transitive process-tree supervisor. The older
`scripts/fixtures/port-authority-clock-cases.mjs.txt` remains unchanged and unused.

Initial failed runner SHA-256:
`f3a60100eb41c7ed33fb69766dee06f3b8782449dc6fcd7031ca5534bcfd2086`.
Final passing runner SHA-256:
`66458c568d37da44e5f5c700043a5a98a9abb9ea55b4dda2c73ec969d53dee97`.
Original package hardening SHA-256:
`db0d6185b4d5e7d218c6850446eb8832627fb2c11fe6e3c2ce3d65545eabeb47`.
Initial private harness SHA-256:
`3d03193dd33932acd9dc81e5921648ce72edb6e4d77da7e6de1f8bbd8a5b5fb6`.
Final private harness SHA-256:
`be122142862a1079dbe137343812646d602582bcc48a3b51ba1be4c47bfdd097`.

## Actual bound validation

```sh
export UNIFIED_TASK_ID=FGU-d889655a-2deb-421c-98bf-a5141e2d04d3
export TASK_PLAN_FILE=.local/tasks/FGU-d889655a-2deb-421c-98bf-a5141e2d04d3.md
export UNIFIED_CONTEXT_FILE=.local/tasks/port-authority-clock-observed.json
node scripts/validate-task-plans.mjs
node scripts/check-unified-preflight.mjs "$UNIFIED_TASK_ID"
pnpm run test-fast -- "$UNIFIED_TASK_ID"
```

Initial run: `9631abaa-aecd-4e14-990e-0ff11f878e8d`.
Observed tier **FAIL**, top-level exit 1, approximately 80 seconds, before the
private waiter correction. The failed evidence is retained, not relabeled.
All three required steps executed; no original step omitted.

| Step | Actual result | Supervisor |
|---|---|---|
| gate-unit | 56 passed, 0 failed/skipped/cancelled; exit 0 | quiescent true, no block |
| regression-guard | 32 passed, 0 failed/skipped/cancelled; exit 0 | quiescent true, no block |
| port-authority-clock | 9 passed, 1 failed, 0 skipped/cancelled; exit 1; 47.273 seconds nested test duration | quiescent true, no block |

Reports and raw step logs:
`.local/failure-gate/runs/FGU-d889655a-2deb-421c-98bf-a5141e2d04d3/9631abaa-aecd-4e14-990e-0ff11f878e8d/`.
Package source metadata, exact selected cases/arguments, retained snapshot and TAP:
`generated-artifacts/port-authority-clock/proof-ZWE0al/{source.json,proof.tap,tests/}`.
These are local/ignored evidence, not bulk-committed task archives.

### Amended full-tier result

The supported amendment command used the same ID and `test-fast`, the complete
replacement spec `.local/tasks/port-authority-clock-current.spec.json` and
coordination `.local/tasks/port-authority-clock-amendment-coordination.json`:

```sh
node scripts/amend-plan.mjs "$UNIFIED_TASK_ID" test-fast \
  "Owner-approved private replacement-waiter queue headroom correction only; same complete focused workload and unchanged host limits." \
  .local/tasks/port-authority-clock-current.spec.json \
  .local/tasks/port-authority-clock-amendment-coordination.json
```

After native reconciliation and admission, the full supported command above
produced run `a3100529-1e7e-4b19-b3e7-b61ea538d536` under the amended seal.
Observed **PASS**, exit 0, 84.204 seconds total, all original steps executed:

| Step | Final actual result | Supervisor |
|---|---|---|
| gate-unit | 56 passed, 0 failed/skipped/cancelled; exit 0 | quiescent true, no block |
| regression-guard | 32 passed, 0 failed/skipped/cancelled; exit 0 | quiescent true, no block |
| port-authority-clock | 10 passed, 0 failed/skipped/cancelled; exit 0; 47.894 seconds nested test duration | quiescent true, no block |

Final raw report/step logs:
`.local/failure-gate/runs/FGU-d889655a-2deb-421c-98bf-a5141e2d04d3/a3100529-1e7e-4b19-b3e7-b61ea538d536/`.
Final source metadata, exact package/private hashes, selected cases/arguments
and TAP: `generated-artifacts/port-authority-clock/proof-qhcLP1/`.
No execution-source changes occurred during the run.

## Recurrence-to-delivery map

All cases below run under the one bound proof step, with only the explicitly
approved private replacement-waiter queue correction described above.
Hardening cases are in `.agents/skills/port-authority/tests/hardening.test.mjs`;
the core case is in `.agents/skills/port-authority/tests/core.test.mjs`.

| Label / scenario | Actual case | Detecting assertion | Observed |
|---|---|---|---|
| startup / wrong-phase classification | `wall-clock reversal: expiry before dispatch returns 4 and retains the unfinalized lease` | Exact exit 4, actual one-hour reversal, no dispatch marker/watchdog registration, launching lease with recoveryRequired true, null group/empty observed list, exited owner and duration under 10 s | PASS |
| dispatch / no positive dispatch evidence | `wall-clock reversal: confirmed dispatched work times out with exit 1 and verified cleanup` | Marker records PID/startTime before clock reversal; exact exit 1, watchdog registered, FAILED execution-budget with workloadStopped true, exact owned incarnation dead, lease absent, duration under 10 s | PASS |
| queue / queue proof suppressed by execution failure | `wall-clock reversal: queue expiry returns 3 without dispatch or changing the live owner's lease` | Independent test registration; reversal injected after enqueue timestamps; exact exit 3, no marker/acquisition, byte-identical live-owner lease, duration under 10 s | PASS |
| budgets / core startup mistaken for dispatched cleanup | `core: missing/overflow limits deny and execution expiry cannot become success` | Invalid limits deny before dispatch; valid execution must write marker before exact exit 1, stopped-work evidence and lease release | PASS |
| budgets / expiring admission hides dispatched supervision | `expired admission evidence does not disable supervision of an already dispatched child` | Obtain child incarnation before exit 1; assert expired context, stopped child and released lease | PASS |
| budgets / replacement overlaps or fails to enter after timeout | `execution budget stops owned work before replacement` | Obtain first child incarnation; require first exit 1 and replacement exit 0 without old incarnation alive; replacement alone receives 8000 ms queue headroom | Initial FAIL: replacement exit 3; final PASS with exact first exit 1, replacement exit 0 and stopped first incarnation |
| budgets / direct dispatcher escapes | `direct package-script dispatcher fixture cannot bypass outer execution deadline` | Positive marker, 5000 ms limit, exact exit 1, execution-budget, stopped-work evidence and lease release | PASS |
| budgets / async or hook hang escapes | `async test and hanging hook report finite timeout; outer wrapper stops remaining handles` | Both variants require positive marker, per-test timeout text, outer execution-budget and stopped-work evidence, lease release | PASS |
| budgets / synchronous hang defeats timer | `outer supervisor stops synchronous test despite its blocked per-test timer` | Positive marker before synchronous hang, exact exit 1, execution-budget, stopped-work evidence and lease release | PASS |
| budgets / late raw zero wins deadline | `late raw zero cannot win the execution deadline race` | Marker gates a 5500 ms observation pause; require rawExitCode 0 but overall exit 1 for execution-budget and lease release | PASS |

### Negative detection by inspection

Read-only historical comparison with the old archive's
`wall-clock reversal cannot extend queue or execution elapsed limits` shows
one combined test, 200 ms execution budget, exact exit-1 assertion **before**
queue setup, no positive dispatch marker and call-count reversal without
phase evidence. It cannot satisfy the new exact startup-4 case, dispatched
incarnation/reversal requirements or independent queue registration.
The new proof requires all ten exact case names and exact test/pass counts,
zero failures/skips/cancellations and successful process exit.
It cannot accept the old combined body or a passing subset. This is reasoned
source inspection, not an executed mutation test.

## Initial failure classification and approved resolution

No ignored baseline matches. The initial failure was **potential regression**;
no unchanged retry or self-classification as pre-existing was performed.
The Port Authority step has no supported isolated-retry mapping.

Inspection of the exact package shows the replacement waiter inherits
`VALIDATION_LOCK_TIMEOUT_MS: "5000"` from `setup`. The first resistant workload
has `VALIDATION_LOCK_MAX_HOLD_MS: "5000"`, with additional 150 ms termination
grace, 1000 ms kill bound and launch/cleanup work. The replacement is launched
after a positive first-workload marker. It can exhaust its queue window before
the first owned workload is stopped and exclusion is released. In this run it
returned exactly 3 (`queue timeout; no takeover of live/uncertain ownership`)
rather than the asserted 0. The first exit-1 assertion succeeded.
This is evidence of an inadequate fixture budget relationship; it is not a
claim of a live runtime cleanup defect or definitive scheduling reconstruction.

The installed source remains immutable. The owner explicitly approved a
narrowly documented **private fixture** correction giving only this replacement
waiter 8000 ms queue headroom beyond the first execution/cleanup window.
The supported amendment and subsequent complete tier PASS are recorded above.
No installed test was edited, no case dropped, no exit expectation weakened,
no host budget raised and no tier switched. This is an explicit diagnosed
correction followed by fresh validation, not an unchanged passing retry or
evidence that the original failure was pre-existing.

Delivery is now **PASS for the amended focused scope**. The original package's
uncorrected replacement-waiter fixture is not certified by that result; the
private correction is part of the tested snapshot and is disclosed.

## Preservation and exact changed files

All six pre-existing registry records were compared as complete JSON objects
against the pre-provisioning snapshot and are unchanged, including both #41
records and its consumed incomplete reservation. #13 and #41 remain MERGED
historical native work; none of their IDs, seals, bindings or results was reused
or amended. Only supported provisioning and runner operations appended this
task's registry evidence.

All tracked pre-work file fingerprints outside the canonical package, existing
proof and supported registry writes were compared and unchanged, including
Unified source/policy, all Regression Guard sources/references, baseline, tier
file, original clock fixture, app files and prior investigation report.

Changed paths outside the package:

- `scripts/port-authority-clock-proof.mjs`
- `docs/validation/unified-task-registry.json` (supported new identity/run only)
- `docs/validation/port-authority-clock-repair-delivery.md` (this handoff)

Exact canonical package member paths under `.agents/skills/port-authority/`:

```text
AUTHORING-SPECIFICATION.md
CLOCK-TEST-REPAIR.md
COMPATIBILITY-VERIFICATION.md
PACKAGE-MANIFEST.json
PREFLIGHT-REVIEW-VERIFICATION.md
README.md
SKILL.md
SOURCE-MANIFEST.json
VERIFICATION-REPORT.md
reference/advanced-controls.md
reference/runtime-contract.md
reference/symptom-guidance.md
scripts/free-ports.mjs
scripts/host-capabilities.mjs
scripts/runtime-environment.mjs
scripts/validation-lock.mjs
tests/core.test.mjs
tests/hardening.test.mjs
usage-prompt.txt
validation/budget-startup-repair-focused.log
validation/budget-startup-repair-full-run-1.log
validation/budget-startup-repair-full-run-2.log
validation/clock-budget-final-run-1.log
validation/clock-budget-final-run-2.log
validation/clock-repair-full-run-1.log
validation/clock-repair-full-run-2.log
validation/clock-stage-focused.log
validation/core-budget-fixture-focused.log
validation/late-race-and-reentry-focused.log
validation/preflight-review-contract.log
validation/run-1.log
validation/run-2.log
validation/unified-compatibility-run-1.log
validation/unified-compatibility-run-2.log
```

The 15 package author `.log` members are intentionally retained as canonical
package content despite the repository's broad log ignore rule. They are
source evidence, not newly generated validation output.

## Explicit limits

- Source parity and module syntax are verified; the complete amended bound tier
  **passed**. The initial full-tier failure remains in history.
- All three phase-specific guards and related selected budget coverage passed.
  The replacement-waiter result applies to the approved corrected private
  fixture, not the unchanged original fixture.
- The author's nested 78/78 logs are not a CloudPainter tier PASS. Its second
  final outer author run reports failure; those bytes remain preserved.
- No full-package suite, two-run activation acceptance, browser, provider,
  database or live port/process validation was attempted.
- Separate read-only review: not selected. Executor assessment above is not
  independent review or a substitute for successful required validation.
- No live controls, runtime callers, services, hooks, CI, deployment or
  production operations were activated or modified.
