# Local Unified execution boundary

## Authorized scope and acceptance

The owner's attached instruction authorizes narrowed local implementation and
conditional activation after required checks and independent acceptance. It
supersedes the expanded seven-package readiness proposal, not the canonical
Unified contract. Distributed allocation, signed task identities, external
evidence storage, blanket recovery drills and remote CI integration are deferred,
not prerequisites for this local-only change.

Canonical authority: `.agents/skills/failure-gate-unified/SKILL.md`, SHA-256
`f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12`.
Exactly one bound tier is authorized; references to a "ceiling" never authorize
another tier. Canonical Regression Guard requirements remain applicable.

## Supported routes

The Agent's shell executes from this workspace. The CLI derives its root from
its module location, not a caller flag. Enrollment records the real root,
filesystem device/inode and current kernel boot fingerprint in an ignored local
receipt, with its digest pinned in policy. These are execution-location checks,
not authentication. `REPL_ID` alone grants no authority.

Isolated task copies, CI checkouts, moved roots and reboots cannot reuse this
receipt. A missing or mismatched receipt blocks before provisioning or running.
They may return proposed artifacts for authorized local application, but must not
claim to run Unified or start implementation requiring an unprovisioned plan.
There is no remote execution route or automatic re-enrollment. A new host/boot
requires explicit review of identities, retained leases and recovery before an
approved re-enrollment mechanism is added; never edit the receipt to bypass it.

This is cooperative repository enforcement, not a sandbox against a malicious
workspace writer who can rewrite the gate itself. App credentials, Clerk roles
and provider authorization are unchanged.

## Commands and caller coverage

Before cutover, `node scripts/configure-local-gate.mjs enroll-migration` enables
only the exact approved migration specification. It does not activate Unified
for general work. `node scripts/new-plan.mjs
docs/validation/unified-local-migration-spec.json` reserves one permanent ID and
generates its sealed plan. A failed/cancelled migration cannot mint a replacement
under this bootstrap; reconcile explicitly instead.

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
also checks the ID, sealed plan, tier, authority and target lease. The plan guard
requires both context variables. Nested tier workload steps are covered by the
parent's admission and supervision; they do not allocate another ID.

Use `node scripts/amend-plan.mjs ID TIER "rationale" [spec.json]` after cutover
for a supported recorded amendment. Do not mutate sealed plans or registry
records manually. The bootstrap's fixed approved scope is not amendable.

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

## Verification and activation

Migration tier: `test-fast`, justified in the generated specification. It runs
gate fixtures and Regression Guard, with finite per-test/step/overall timeouts,
process supervision and target exclusion. Wrong-tier/concurrency demonstrations
use private fixture roots, not duplicate or unauthorized live runs.

Activation is through `configure-local-gate.mjs activate ID acceptance.json`.
It requires the migration's completed bound-tier PASS, quiescence, current raw
logs, unchanged execution sources and independent acceptance covering those
sources and current task reconciliation. A retry-only pass is insufficient.
Acceptance is a trusted Agent/reviewer record, not an untrusted user-auth API.

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
resuming. A stale or absent authority receipt must block. No live restore,
deletion, blanket recovery exercise or backup retirement is authorized.
