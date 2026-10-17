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

New plans use the policy's `newPlanTemplate: unified-v3` representation. The
per-record representation is separate from the canonical skill revision:
historical `legacy-v1` and `unified-v2` renderers/mappings remain unchanged.
Amendments explicitly adopt the new complete representation; supply a complete
replacement spec when an older spec lacks its required sections.
See [Regression Guard authoring](regression-guard-authoring.md) for all
declaration variants and the complete spec.

Provisioning validates rendered content with the strict Regression Guard core
before writing/sealing the plan; a post-reservation rejection retains an
incomplete identity, never an admitted plan. Amendments validate the replacement
before invalidating or replacing the old seal/binding. Bound checks and both
runner admission passes invoke the same strict single-plan core before reports,
leases or workloads can launch. No repair pass is used for Unified plans.
If an unchanged sealed declaration fails a newer checker, its hash/binding can
still be verified as an amendment source; only a compliant replacement can be
published. This is not execution permission for the rejected source.

`check-failure-gate.mjs` without an ID remains a read-only policy summary only
when `TASK_PLAN_FILE` is unset. A selected target requires its bound ID; empty,
non-Markdown, missing or directory targets fail rather than scanning archives.
Standalone `check-regression-guard.mjs` retains strict, fix-stub and stubs-only
modes. Fix-stub is only for genuinely editable legacy plans where that contract
permits it; it refuses to repair a Unified plan. Legacy routing is not reactivated.

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

## Lifecycle readiness

Ordinary tasks use `node scripts/new-plan.mjs path/to/spec.json` to provision
their identity and sealed plan, and
`node scripts/amend-plan.mjs ID TIER "rationale" [spec.json]` for supported
amendments. In the task's own main-workspace or assigned task checkout, work
from that environment's repository root. Confirm the recorded ID is still
eligible and its exact sealed plan and registry binding are present; do not
re-provision or fabricate replacement context when they are missing.
Set `UNIFIED_TASK_ID` to that ID and `TASK_PLAN_FILE` to its recorded
repository-relative plan path, then run `node scripts/validate-task-plans.mjs`
and the full bound tier with `pnpm run <bound-tier> -- "$UNIFIED_TASK_ID"`.
For an ID bound to `test-fast`, that runner command is
`pnpm run test-fast -- "$UNIFIED_TASK_ID"`. A task executing in a separate
checkout must validate there, not substitute a main-workspace result.
Plan-guard success establishes plan validity, not implementation permission.

Normal restarts and different checkout paths do not themselves invalidate
admission: the current gate uses no machine-identity enrollment, boot/device
fingerprint or workspace-location receipt. Provisioning, sealed-plan guards,
single-tier binding, bounded execution and single flight remain enforced.
The [owner-directed repair record](unified-gate-repair.md), especially
"Changes" and "Observed maintenance checks", documents bounded disposable
fixtures for changed boot/device inputs without reading machine identity,
provisioning/guards/runs at a different checkout path, historical sealed
contracts, supported amendments, and wrong-tier/changed-plan rejection.
Those are simulated lifecycle/copy fixtures, not a live reboot, production
recovery exercise or actual platform task-agent test. The repair's maintenance
results are not a live validation-tier PASS or proof that every tier is ready.

Admission still blocks on:

- Canonical skill/policy pin drift.
- Missing or malformed policy, registry or baseline catalog.
- An unknown sealed-contract template.
- An ineligible ID, missing or changed sealed plan, or missing/mismatched task
  context.
- A wrong tier or changed workload definition without a supported amendment.
- Retained transaction/target locks or an active or uncertain owned run.
- Unavailable required capabilities; higher-tier database/browser routes remain
  denied rather than certified by fast-tier evidence.

For gate defects, follow the canonical
`.agents/skills/failure-gate-unified/SKILL.md` section "Installing, updating and
repairing the gate" under an authentic owner instruction. That gate-only
maintenance is outside ordinary task admission, does not mint IDs or rewrite
ledger records/bindings, and reports its own checks as maintenance, not a tier
PASS. Without the required owner instruction, report the exact blocker and
smallest repair rather than bypassing it. Task-specific corrections and
amendments still use the normal supported admission routes; gate repair does
not waive them or replace a task's required bound-tier run.

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
