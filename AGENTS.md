# Task execution

Read `replit.md` and `docs/validation/unified-policy.json` before new work.
The only Failure Gate target is the canonical
`.agents/skills/failure-gate-unified/SKILL.md`.

Follow `docs/validation/unified-local-execution.md`. While staging, only the
explicitly enrolled migration specification can provision/execute. After an
accepted cutover, every new task plan and its validation must use the verified
local provisioner, one bound tier and sealed plan context. Do not use independent
app checks as a substitute for the task's tier.

If Failure Gate admission or a plan guard fails, follow the canonical skill's
"Installing, updating and repairing the gate" section. Never manufacture an ID
or implement an unprovisioned task. Do not rebind historical/native task IDs.
Existing CI remains independent CI.

## Regression Guard authoring and delivery

Apply the canonical `.agents/skills/regression-guard/SKILL.md` and its required
references by substance, not by title or keyword alone. Before publication, emit
(the provisioner's input order does not change):

`[REGRESSION-GUARD] Classification: <bug-fix|behavior-change|error-handling|security-privacy|data-integrity|concurrency-lifecycle|performance-reliability|compatibility-contract|not-applicable>. Guard: <covered — <test file> | N/A — <reason> | self-satisfying>.`

Use comma-separated categories for mixed work. Consider all eight categories.
A material change cannot be waived by a test-oriented title, a negated exclusion
or an unrelated additive/cosmetic/non-material clause. Pure additive, cosmetic,
actual non-executing deletion-marked and genuinely non-material tasks remain excluded; test/guard-only
deliverables may use Self-satisfying. Production changes merely accompanied by
tests must use normal coverage. Executing removals with DELETE titles are not
excluded. Changes to admission/execution itself plus tests need normal coverage.
Classify the wrong behavior at the affected layer.

Use the complete versioned specification described in
`docs/validation/regression-guard-authoring.md`. Name the concrete recurrence,
same-layer test file (it need not exist yet), and assertion that fails when the
old failure returns. Existing coverage counts only with a named test and specific
assertion. N/A must explain one of the four canonical impossibilities, not cost
or difficulty. Never treat acceptance prose or a proposed follow-up as proof:
resolve the exact follow-up's stable reference, committed lifecycle, ownership,
recurrence scope and applicable authorization using authoritative host evidence
at publication, before execution and at delivery. If the local CLI cannot verify that
evidence, deliver the guard here or report the adapter limitation; do not fake it.

Before completion, executors must compare the named guard with actual delivery:
record scenario → test file/test name → observed assertion/result. Verify it
fails for the old failure at the correct layer by inspection or an authorized
negative fixture. Validate the N/A facts or authoritative deferral instead when
applicable. Report missing coverage as incomplete, not covered because lint
passed. Keep baseline/Validation ownership and the original bound workload:
adding a guard never authorizes another tier or independent app check.

### First action after Start, and after a mid-task coverage gap

Before implementation, read the canonical contract and adopted mapping, actual
scope, authoritative admitted plan, plan hash, binding and current host task
authorization/lifecycle. Gate maintenance uses Unified's owner-directed exception,
not a fabricated live ID. The shared preflight project is not delivered merely
because it is proposed. No native Start hook is installed here.

For an ordinary task, use the read-only RG preflight component:
`TASK_PLAN_FILE=.local/tasks/ID.md node scripts/check-regression-preflight.mjs ID OBSERVED_PLAN_SHA256`.
It checks local plan validity, current revision, quiescence, deferral evidence and
explicit bound-workload inclusion, NOT host approval or actual test delivery.
Inspect host scope/authorization separately. Where the host exposes native text,
compare its approved scope with the authoritative seal; the programmatic
`regressionPreflight` also accepts `nativeSealedText` for an exact supplied sealed
representation. A native description edit alone is not a reseal.

Reuse adequate coverage without a gratuitous amendment. For a gap, automatically
prepare concrete scenarios, affected-layer cases and detecting assertions (or
factual exception), then use only supported `amend-plan.mjs` under authorization
that actually covers the candidate. Ask only for uncovered scope/approval.
An invalid draft is not permission to implement. Repeat the current revision
check immediately before resuming; local preflight is not an atomic editor lock.

For a mid-task gap, pause affected work and preserve observations and changes.
Do not stop unrelated work. Establish no active/uncertain owning validation run
or target lease remains through existing Unified routes; amendments refuse those
conflicts. Never delete a lock or invent cancellation. Re-admit the amended
revision, reassess earlier changes, renew affected test evidence, and resume only
with covered authorization. New admission never retroactively certifies edits
or earlier results.

Maintain the canonical revision-bound delivery handoff, including every risk,
actual case/assertion/layer, tested snapshot/results, negative-control evidence
or substantiated exception/deferral. Check actual inclusion in the unchanged
adequate assigned workload; absent inclusion needs supported resolution, not a
silent tier change. Separate read-only application review is **not selected**
unless the owner selects it or an identifiable approved requirement mandates it.
Do not create an automatic reviewer or block delivery for its absence.

This is cooperative project enforcement. Syntax checks cannot prove test
quality, chat announcements, task acceptance, actual delivery, or Replit's
platform completion decision. Never claim otherwise.
