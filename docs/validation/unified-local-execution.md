# Unified execution

**Effective state: ACTIVE**, cutover **2026-10-14T04:48:37.343Z** via
`configure-local-gate.mjs activate`, after independent acceptance recorded in
`unified-cutover-acceptance.json` and fresh reconciliation in
`unified-phase6-reconciliation.md`. Failure Gate Unified governs new tasks from
this point forward, through the portable admission controls below. The pre-cutover
bootstrap instructions are retained as history, not a second admission policy.

## Authorized scope and acceptance

The owner's attached instruction authorizes narrowed local implementation and
conditional activation after required checks and independent acceptance. It
supersedes the expanded seven-package readiness proposal, not the canonical
Unified contract. Distributed allocation, signed task identities, external
evidence storage, blanket recovery drills and remote CI integration are deferred,
not prerequisites for this local-only change.

Canonical authority: `.agents/skills/failure-gate-unified/SKILL.md`; the current
SHA-256 is recorded in `unified-policy.json`. Historical task contracts retain
their own sealed revision, not the latest pin by substitution.
Exactly one bound tier is authorized; references to a "ceiling" never authorize
another tier. Canonical Regression Guard requirements remain applicable.

## Supported routes

The CLI derives its root from its module location, not a caller flag. Admission
works after restarts and in task environments, enforced by the provisioner,
sealed plans and the tier-bound runner. No machine-identity enrollment is needed.
Random UUIDs, transactional reservations and retained tombstones prevent reuse.
The merge guard compares against the committed registry and rejects lost IDs,
lost tombstones, rewritten history and unsupported record changes.

This is cooperative repository enforcement, not a sandbox against a malicious
workspace writer who can rewrite the gate itself. App credentials, Clerk roles
and provider authorization are unchanged.

## Commands and caller coverage

The original migration enrollment and activation commands are retired.
Their reports, bootstrap records and cutover marker are history, not instructions
to repeat staging or re-enrollment.

After cutover, create a filled repository-relative specification and run:

```sh
node scripts/new-plan.mjs path/to/spec.json
export UNIFIED_TASK_ID=FGU-<generated-id>
export TASK_PLAN_FILE=.local/tasks/$UNIFIED_TASK_ID.md
node scripts/validate-task-plans.mjs
pnpm run test-fast -- "$UNIFIED_TASK_ID"
```

Replace `test-fast` with the ID's actual bound tier, never a convenient tier.
All four package tier aliases use the checked CLI; direct `run-validation.mjs`
also checks the ID, sealed plan, recorded contract, tier and target lease. The plan guard
requires both context variables. Nested tier workload steps are covered by the
parent's admission and supervision; they do not allocate another ID.

Use `node scripts/amend-plan.mjs ID TIER "rationale" [spec.json]` after cutover
for a supported recorded amendment. Do not mutate sealed plans or registry
records manually. New specifications require `coverageEvidence`, identifying
the tier definition/workload and supported invocation. An amendment applying the
current contract requires a complete current specification; it records the
old/new contract and tier and reseals the same ID.

For gate installation, update or repair, follow the canonical skill's
"Installing, updating and repairing the gate" section under an authentic owner
instruction. Gate maintenance runs the gate tests directly as maintenance checks,
not a tier PASS; it does not mint a task ID or rewrite ledger records.

Independent application unit/build commands and
`.github/workflows/cloudpainter-ci.yml` remain independent checks, not alternate
Unified task-validation entry points. The post-merge hook is resource-mutating
setup, not validation; never invoke it as a gate test. Do not expose credentials
or dispatch remote CI for this migration.

`test-standard-plus` and `test-heavy` retain unavailable resource requirements
and fail closed. No capability strings are added to pretend they work.
`test-standard` is registered but is not verified operational by a fast-tier run.
The automated owner-closure CLI stays denied without authentic direction
integration. Visible owner instructions may be reported administratively under
the canonical contract, never as test PASS or forged CLI authority.

## Verification and historical activation

Migration tier: `test-fast`, justified in the generated specification. It runs
gate fixtures and Regression Guard, with finite per-test/step/overall timeouts,
process supervision and target exclusion. Wrong-tier/concurrency demonstrations
use private fixture roots, not duplicate or unauthorized live runs.

The completed cutover used `configure-local-gate.mjs activate ID acceptance.json`
with independent acceptance and a completed migration run. That command is now
retired; do not reactivate or treat old results as a fresh PASS. Current repair
evidence is in `unified-gate-repair.md`.

## Preservation and recovery

The existing owner-confirmed Remix reference is
`4b60cdc8-3fdb-439e-b554-21dd7e77a03e`, source anchor
`817e478a886a46ff919d9ff1c681e3d78324406f`; exact copy provenance remains
unverified. See `docs/resource-recovery-coverage.md` for resource unknowns.
This change touches source and gate metadata only. No database, upload, sketch,
secret, provider or deployment mutation is needed.

Preserve original native task contracts, consumed gate IDs, baseline entries
and historical reports. Old readiness/handoff records are dated history where
superseded by this approved scope, not simultaneous new-task policies.
During recovery stop admission first. Recover source through an approved
checkpoint/Remix action, but never overwrite newer identity/tombstone or run
records with an old ledger. Reconcile consumed IDs and uncertain leases before
resuming. No live restore,
deletion, blanket recovery exercise or backup retirement is authorized.
