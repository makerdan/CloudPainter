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

Apply the canonical `.agents/skills/regression-guard/SKILL.md` by substance,
not by title or keyword alone. Before the first plan heading, emit:

`[REGRESSION-GUARD] Classification: <bug-fix|behavior-change|error-handling|security-privacy|data-integrity|concurrency-lifecycle|performance-reliability|compatibility-contract|not-applicable>. Guard: <covered — <test file> | N/A — <reason> | self-satisfying>.`

Use comma-separated categories for mixed work. Consider all eight categories.
A material change cannot be waived by a test-oriented title, a negated exclusion
or an unrelated additive/cosmetic/non-material clause. Pure additive, cosmetic,
DELETE-prefixed and genuinely non-material tasks remain excluded; test/guard-only
deliverables may use Self-satisfying. Production changes merely accompanied by
tests must use normal coverage. Classify the wrong behavior at the affected layer.

Use the complete versioned specification described in
`docs/validation/regression-guard-authoring.md`. Name the concrete recurrence,
same-layer test file (it need not exist yet), and assertion that fails when the
old failure returns. Existing coverage counts only with a named test and specific
assertion. N/A must explain one of the four canonical impossibilities, not cost
or difficulty. Never treat acceptance prose or a proposed follow-up as proof:
resolve the exact follow-up's accepted/non-draft state using authoritative
available host tools at plan-write time. If the local CLI cannot verify that
evidence, deliver the guard here or report the adapter limitation; do not fake it.

Before completion, executors must compare the named guard with actual delivery:
record scenario → test file/test name → observed assertion/result. Verify it
fails for the old failure at the correct layer by inspection or an authorized
negative fixture. Validate the N/A facts or authoritative deferral instead when
applicable. Report missing coverage as incomplete, not covered because lint
passed. Keep baseline/Validation ownership and the original bound workload:
adding a guard never authorizes another tier or independent app check.

This is cooperative project enforcement. Syntax checks cannot prove test
quality, chat announcements, task acceptance, actual delivery, or Replit's
platform completion decision. Never claim otherwise.
