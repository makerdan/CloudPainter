# Port Authority clock-reversal investigation

## Result and scope

**PASS — focused investigation and fixture repair.** The reported failure is a
phase-sensitive test assertion: the old case assumed a command had dispatched
within a 200 ms execution budget, even though that budget includes startup.
The observed exit 4 is the runtime's explicit pre-dispatch safety path, not
evidence of an extended deadline or a need to change runtime behavior.

This does not prove the precise scheduling or filesystem delay on the historical
host. Its log has no per-startup-stage timings. It does establish the failing
branch and reproduces the same reason, exit, cleanup and retained-lease outcome
with controlled delay against the approved runtime. No runtime defect was
diagnosed or repaired. A passing historical retry alone was not used as proof.

No supporting package was restored into `.agents/skills/port-authority/`.
No application, workflow, live control, production resource or pre-existing
process was changed. Private fixtures use the archive's simulated advanced host
adapter/profile, not a genuine reclaim or authorization provider.

## Source and historical evidence

Source: `attached_assets/port-authority-unified-compatible_1792279619075.zip`

SHA-256:
`d17fec4280ac00940eb3e58a5a15b92eae1a4704d5b57da1aaa470f9c18a2a77`

Read from that ZIP without executing it:

- `COMPATIBILITY-VERIFICATION.md`: 74/75 in run 1; 75/75 in run 2.
- `validation/unified-compatibility-run-1.log`: the clock case expected 1 but
  received 4. Raw evidence includes watchdog registration, `execution-budget`,
  `supervision-error-owned-cleanup`, `workloadStopped:true`,
  `leaseRetained:true`, and the reason
  `dispatch cancelled, watchdog unavailable, or execution budget expired`.
- `validation/unified-compatibility-run-2.log`: the combined clock case passed
  without changes. This establishes intermittency, not pre-existing provenance,
  root cause by itself, or two consecutive complete passing runs.
- `tests/hardening.test.mjs`, original lines 929–942: the 200 ms execution
  assertion at line 937 precedes the queue subcheck. That assertion's failure
  prevents the queue subcheck from running.

The runtime source explains the branch:

1. `scripts/validation-lock.mjs` starts `acquiredMono` after lease acquisition.
2. Admission, durable lease transitions, watchdog startup/IPC, gate startup/IPC,
   watchdog registration and another durable transition consume that same budget.
3. At original lines 537–540 it checks cancellation, watchdog liveness and elapsed
   execution time **before sending dispatch**. Failure throws the recorded reason.
4. The catch path performs bounded owned-work cleanup, returns 4 and retains the
   lease. It does not report normal post-dispatch timeout completion.
5. The normal dispatched timeout path independently verifies quiescence before
   release and returns 1.

The historical log identifies the pre-dispatch branch, although its combined
reason does not alone distinguish every operand. Watchdog `execution-budget`
evidence and the controlled reproduction support startup-budget exhaustion as
the cause. The log provides no evidence that the user command dispatched.

## Admitted route and budgets

The owner explicitly approved adding a focused private-fixture workload while
preserving existing checks, a 60-second step limit and the existing 120-second
tier limit. This was limited gate maintenance, not installation or activation.

`docs/validation/unified-tiers.json` now adds `port-authority-clock` to
`test-fast` without removing `gate-unit` or `regression-guard`. The existing
5-second cleanup allowance and process-tree subreaper remain unchanged.
Higher tiers inherit the step; their capability denials remain intact.
The tier-definition hash changes: older records and bindings were preserved,
not silently rebound. Any future execution of an older record must use the
supported amendment route to reassess and acknowledge changed coverage.

Maintenance verification used the existing finite supervisor with a
credential-free environment: 63/63 gate/guard tests passed, exit 0,
`quiescent:true`. Log:
`generated-artifacts/port-authority-clock/gate-maintenance.log`.
This was maintenance evidence, not an admitted tier PASS.

The provisioner rejected the first plan's self-satisfying declaration before
package execution. Its permanently consumed reservation
`FGU-881d0f95-e85a-4aec-a3f5-5ab30d8b213a` remains `incomplete`.
No ledger record was hand-edited or reused. The declaration was corrected to a
normal guard, then the provisioner's supported new-reservation path was used
(also covered by its generation-failure fixture).

Admitted task: `FGU-cc015bab-422b-40f8-83af-fdff4c07c58e`, linked to native
task 41, bound only to `test-fast`. Specification:
`docs/validation/port-authority-clock-plan.json`.

Supported invocation:

```sh
export UNIFIED_TASK_ID=FGU-cc015bab-422b-40f8-83af-fdff4c07c58e
export TASK_PLAN_FILE=.local/tasks/$UNIFIED_TASK_ID.md
node scripts/validate-task-plans.mjs
pnpm run test-fast -- "$UNIFIED_TASK_ID"
```

The added script is a **supervised workload step**, not a separately authorized
standalone diagnostic entry point. It verifies the approved ZIP hash before
extracting only fixed code-owned members. Extraction reads have 5-second bounds;
the focused Node child has a 45-second outer bound and a 15-second test deadline.
The inherited fixture cleanup hook remains bounded to 5 seconds.
The tier independently supervises detached descendants, checks incarnation
before signaling its own children, and verifies quiescence.

No blanket package authority, new tier, baseline ignore or live recovery
capability was added. The inspected baseline catalog has no active entries;
neither historical intermittency nor new harness failures were classified as
pre-existing.

## Repair and recurrence proof

`scripts/fixtures/port-authority-clock-cases.mjs.txt` is the durable replacement
for the original ambiguous case. `scripts/port-authority-clock-proof.mjs`
constructs a private repaired test snapshot from the hash-pinned archive.
The original ZIP is unchanged. No supporting executable is installed.

| Scenario / named case | Budget and assertions | Observed |
| --- | --- | --- |
| `clock: startup expiry reproduces old exit assertion and retains exclusion` | Keep original 200 ms execution budget. Inject one 250 ms fsync delay after watchdog registration, before dispatch. Require exactly exit 4, execution-budget evidence, no command marker, confirmed stopped owned incarnations, recovery-required lease retained. Replacement requires exit 4, cannot dispatch, and cannot rewrite the retained lease. | Passed |
| `clock: reversed wall time cannot extend a dispatched execution deadline` | Separate private fixture with 2,000 ms startup-inclusive execution allowance, unchanged finite outer limits. Require actual command readiness and a wall-clock reversal while it runs; require exactly exit 1, execution-budget evidence, stopped exact command incarnation and quiescent lease release. Elapsed time must remain below 7 seconds, not extend by an hour. | Passed |
| `clock: reversed wall time cannot extend the queue deadline` | Keep 150 ms queue budget. Reverse wall time by an hour after publishing the waiter; verify that reversal actually occurred while queued. Require exactly exit 3, no dispatch, byte-identical protected lease, and elapsed time below 3 seconds. | Passed |

The post-dispatch fixture's 2-second allowance is deliberate private startup
headroom, not a host budget change or an acceptance of exit 4. Increasing it
alone is not the repair: readiness, actual reversal, exact exits, stopped
incarnations, lease disposition, replacement denial and independent queue
execution are all required. The original 200 ms failure window remains tested.
Queue execution no longer depends on the preceding execution assertion.

The startup case explicitly asserts that the old `assert.equal(code, 1)` throws
`ERR_ASSERTION` on the reproduced result. This is the negative proof at the
faulty test layer; no passing retry is substituted for it.

Private teardown was adapted to **retain** any fixture directory with a lease.
It does not delete uncertain leases or attempt recovery. Successful lease-free
fixture directories can be removed after their owned jobs close. The existing
outer supervisor confirms no owned descendants remain.

## Fresh run record

The first admitted run (`7af491c3-2509-4c4a-91e8-50bc508bc4c6`) was **FAIL**:
all three case bodies reached the intended exits, but the new retained-lease
teardown used an out-of-scope variable and threw `s is not defined`. The error
was repaired (`env` is the helper's lexical variable); the failure was not
ignored. The queue case was also strengthened to prove a reversal after waiter
publication rather than relying on an unverified count of `Date.now()` calls.

One complete recheck after those explicit changes
(`bbd09dda-b2bd-422a-ab2c-d69c84a0709e`) was **PASS**:

- Gate unit: 38 passed, zero failed/skipped/cancelled.
- Regression guard: 25 passed, zero failed/skipped/cancelled.
- Focused clock proof: 3 passed, zero failed/skipped/cancelled.
- Every step: exit 0, no supervisor block, `quiescent:true`.
- Total admitted elapsed time: approximately 30.6 seconds.

Logs and the authoritative report are under:
`.local/failure-gate/runs/FGU-cc015bab-422b-40f8-83af-fdff4c07c58e/bbd09dda-b2bd-422a-ab2c-d69c84a0709e/`.
These local task archives are not bulk-committed.

The retained private snapshot and transcript are in
`generated-artifacts/port-authority-clock/proof-gzqBq2/`:
`source.json`, `proof.tap`, `tests/clock-focused.test.mjs` and
`tests/hardening.repaired.test.mjs`. The snapshot records the ZIP, runner and
replacement-case hashes. The tier report independently records the runner and
case source fingerprints. Generated output remains ignored.

## Remaining limits

- Only the three affected private cases were executed, not the entire original
  75-test package or the repaired complete suite (now two additional cases).
- This is not two consecutive full package runs, independent host acceptance,
  live installation, activation, genuine provider verification or deployment.
- The exact historical slow startup stage is unobservable from the archived log.
  No claim is made about a particular machine-load or fsync cause.
- The focused step has no isolated retry mapping. After this diagnosed harness
  fix, the full bound tier was rerun through its admitted route; no direct
  diagnostic bypass or unmodified retries-until-passing were used.
