# CloudPainter — separately scoped Unified readiness plan

## Authorization and boundary

The owner authorized **preparation of this readiness plan** in the active
conversation. This is a planning artifact, not a provisioned execution task:
**no gate ID, tier binding, implementation, infrastructure creation or cutover is
authorized by its existence**. Unified remains staging.

Inspected branch/revision: `main`,
`17668e3364a8fb2bb60aba21999aec5172e60219`.
Canonical target: `.agents/skills/failure-gate-unified/SKILL.md`, SHA-256
`f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12`.
Use only that canonical source; do not import older/mirrored rules.

Inputs: [handoff](unified-handoff.md), [delivery record](unified-migration-record.md),
[control verification](unified-phase4-verification.md), and
[resource recovery](../resource-recovery-coverage.md).

## Evidence and recommended architecture

**Confirmed:** current admission rejects staging; local ledger transactions,
wrong-tier checks and process supervision have fixture evidence. They are not
shared authority across isolated copies. `lib/db/src/index.ts` consumes an
environment-selected PostgreSQL connection; that alone proves neither shared
task storage nor an approved gate namespace.

**Unknown:** an authenticated host allocator/approval interface. Official
[task documentation](https://docs.replit.com/core-concepts/agent/task-system)
confirms isolated task copies. Documentation searches also found supported
secret/access-token mechanisms, but did not establish a signed native-task
identity API. This is a bounded unknown, not a global absence claim.

**Recommendation:** one authoritative coordinator for allocation, tier bindings,
amendments, target leases and accepted completion. Prefer a verified supported
host route if available; otherwise separately approve a dedicated coordinator
with durable metadata storage. Keep artwork and provider credentials out.

- All clients address the same verified authority; clone-local JSON is at most
  a projection, never a second allocator or an offline fallback.
- Authenticate clients with scoped enrollment. Separate allocation/execution,
  amendment and owner-closure privileges. Neither `REPL_ID`, a caller-supplied
  file nor a network access token alone proves owner direction.
- Bind IDs to project, canonical contract, plan hash and exactly one tier.
  Commit reservations/tombstones durably before returning; coordinate
  idempotency and target admission transactionally across processes.
- Authority loss fails closed. Expired connectivity does not prove a worker
  stopped: preserve uncertain exclusion until observed cleanup/reconciliation.
- Do not assume isolated agents share the app database. Reusing any existing
  database requires verified reachability, approved namespace/privileges,
  capacity and recovery isolation. Do not replace the application database.

## Ordered work and acceptance evidence

These are proposed work packages, not created tasks or authorized bindings.
Allocate real implementation IDs only through the accepted provisioning route.

| Order | Scope and affected surfaces | Evidence required to finish |
|---|---|---|
| 1. Read-only authority and recovery discovery | Discover actual supported enrollment, owner-direction and stable coordinator/storage routes. Refresh Remix/database/browser/configuration recovery inventory. Produce exact resource and permission choices before provisioning. | Cite supported request/privilege boundaries or name unavailable capabilities precisely. Identify a recoverable code point and disposable-target requirements, or the exact missing evidence/action. No resource creation, credential changes, execution probes or live mutation; actual private-client proof belongs to package 2. |
| 2. Coordinator and identity store | Adapt `scripts/failure-gate/{store,plans,runner,cli}.mjs` behind a coordinator boundary. Preserve permanent IDs, one-tier bindings, amendment history, active-run fencing and immutable raw assessments. | Concurrent independent clients cannot lose reservations, reuse tombstones, forge owner closure, change bindings or duplicate a target. Disconnect/crash/restart never produces PASS or silently clears exclusion. |
| 3. Durable evidence and recovery | Extend `scripts/failure-gate/recovery.mjs`; define versioned manifests for identity/event history, plan/definition hashes, run evidence and lease ownership. Choose approved durable storage and retention. Keep `.local/tasks` environment-local. | Restore into an isolated target, reconcile all consumed IDs/tombstones and verify evidence hashes. Reject stale/foreign/truncated/tampered candidates. Never restore an old ledger over newer identities. Preview alone is insufficient. |
| 4. Tier/resource and failure adapters | Adapt `unified-tiers.json` and the runner; inventory every actual command and output format. Build checked disposable database/browser launch routes with bounded lifecycle and provider-network restrictions. | Exact suite mapping, explicit TAP reporting, relevant nested/non-TAP failure handling and skip detection. Disposable capabilities are verified at admission, not asserted by a string flag. No app/provider credentials forwarded as fallback. |
| 5. Caller/CI alignment | Map package scripts, plan generators, native task ingress, guards, hooks and `.github/workflows/cloudpainter-ci.yml`. Preserve independent checks; integrate portable guards into existing appropriate coverage without duplicate suites. | Local-to-remote coverage table for every portable check, explicit justified exclusions/gaps, context transferred across nested commands. Wrong/missing tier/ID/context denies launch. Do not make remote CI depend on uncommitted local plans or give untrusted PRs authority credentials. |
| 6. Authentic completion | Connect actual attributable owner records/direction and completion readers/writers. Keep execution assessment distinct from administrative closure. | An authorized owner can close administratively with `completionMode: owner_direction`; a caller cannot forge the direction or convert FAIL/BLOCKED into PASS. If no authentic supported route exists, remain BLOCKED rather than simulate it. |
| 7. Independent acceptance and cutover | Independently inspect actual delivery, then reconcile current native tasks. After separate cutover approval, perform one fenced transition with source/definition/evidence linkage. | Sole new-task admission is proven, first real provisioned ID and all wrong-tier refusals are observed, bound-tier execution finishes within its budget, recovery evidence is accepted and competing writers are fenced. No assertion of activation based only on config. |

## Bootstrap, task identity and tiers

There is a deliberate bootstrap boundary: the current provisioner cannot issue
live IDs while staging. **Do not toggle it active merely to build its successor.**
Before implementation, approve a named pre-cutover bootstrap contract with
bounded commands and isolated targets, using supported native task records where
available. Such work remains explicitly non-Unified until adoption; private
fixture IDs are not live migration identities. Do not rebind that work later.

Once authoritative provisioning is accepted, each new Unified execution plan
must be minted/sealed through it before editing and bound to one registered tier:

| Proposed execution scope | Proposed single tier and reason |
|---|---|
| Coordinator, identity/recovery integration, adapters and caller integration | `test-standard-plus`: control tests, type checks and isolated persistence/API integration. |
| Browser capability/owner-flow integration and final full-path acceptance | `test-heavy`: adds isolated authenticated browser and build coverage. |
| Pure guard/parser checks, if genuinely separate from integration work | `test-fast`: only when its full registered suite covers the isolated change. |
| Non-database command/contract mapping changes | `test-standard`: only when type/API/static coverage is adequate without database/browser work. |

These choices are **not authorizations** and do not allow selecting tiers per
retry. Final plans must select exactly one adequate tier, record why, and add the
owning tests to its command definition before sealing. Mid-flight changes use
the documented amendment route; changing a definition invalidates stale bindings.
Keep current finite ceilings unless separately approved evidence justifies an
amendment. No silent escalation.

## Baselines and legacy state

## Pre-existing failures to ignore

The existing catalog has zero entries and an explicit coverage disclaimer;
no whole-app clean baseline is established. Prior format-selection defects were
repaired and their raw history retained. Unrun application checks remain Unknown.
Inspect actual failures before implementation; exact catalog matches must be
declared **Ignored baseline:** or **Owned baseline repair:** in the execution
plan. Do not reset the catalog or promote historical anecdotes into provenance.

**Flaky-test rule:** a passing retry establishes intermittency, not pre-existing
provenance. Preserve observed facts separately from contextual inferences.

Native #2 is merged, not a running gate exception. Retain its original identity,
contract and null gate binding as historical metadata. Reconcile other native
state before cutover; preserve actual in-flight IDs/tiers without assuming
absence from a narrow search. Retain old reports and archives until references
and retention are verified and the owner separately approves retirement.

## Regression Guard

**Covers:** cross-copy double allocation/admission, lost tombstones on recovery,
forged task/tier/owner authority, stale-plan execution, resource leakage and
false passing results after retries, crashes or incomplete evidence.

**Test location:** extend existing `scripts/tests/failure-gate.test.mjs`; add
planned `scripts/tests/failure-gate-coordinator.test.mjs` and
`scripts/tests/failure-gate-recovery.test.mjs` for cross-client and isolated
restore integration. Add owning caller/CI contract tests in the existing scripts
test suite. These additions are deliverables, not claims that files exist now.

**What it checks:** reject all 12 wrong-tier pairs before launch; preserve every
consumed ID after crash/delete/cancel/restore; serialize independent clients;
retain uncertain leases; distinguish ignored/owned/unlisted failures; deny
retry-only provenance and unobserved/skipped PASS; authenticate administrative
closure; block live-resource/provider fallback and untrusted CI credentials.

## Validation and completion

For this planning artifact, use read-only source/record checks, link resolution
and `git diff --check`. No registered application tier is authorized or run.
Prior 50/50 fixture results remain scoped historical evidence, not proof of
future coordinator, recovery, browser or CI implementation.

Observed preparation checks: strict Regression Guard check passed for this one
document using `TASK_PLAN_FILE`; supporting-record links resolved and
`git diff --check` passed. These are planning checks, not implementation or
cutover acceptance.

For implementation, each approved bootstrap/execution contract must name exact
commands, limits, isolated resource identities and ownership. Reuse the finite
supervisor outside workload process groups; use monotonic total/step deadlines,
bounded output, explicit reporters, target single-flight and observable cleanup.
Capability leases must be checked, not blanket global locks or orphan-killing.

Accept readiness only with independent evidence for every required control.
Unavailable machinery/permissions/evidence means BLOCKED; untrustworthy or
unfinished verification means INCOMPLETE; required failures mean FAIL. PASS
cannot include skipped/unobserved required work. Remote run and required-check
status need revision-aware evidence, not workflow presence.

## Recovery, approvals and stop conditions

Before further migration implementation, verify an independent recoverable code
point: the current owner-confirmed Remix has itself changed. If a new supported
Remix action is required and unavailable to the Agent, provide the owner the one
minimal documented UI action, then wait; do not invent a tool or claim success.
Continue to label owner-confirmed evidence honestly.

Local ephemeral fixtures contain synthetic data only. Never use production or
the development app database as a disposable target, and never test recovery by
overwriting/deleting live resources. Preserve registry IDs/tombstones and raw
results across code rollback. Fence admissions before any approved reconciliation;
do not age-delete uncertain locks or permit an old ledger to replace newer state.

Separate approvals are required for:

1. Readiness **implementation/bootstrap**, beyond this plan preparation.
2. Any actual coordinator/store provisioning, app database namespace/schema
   changes, credential/enrollment setup, paid/provider operations, durable external
   copies, live-service changes, remote CI changes/runs or resource restores.
3. Final activation and its exact cutover snapshot, after independent acceptance.
4. Any destructive replacement, retirement, baseline pruning or backup deletion.

Do not duplicate existing Port Authority confirmation/runtime-readiness work or
the production-backup-capacity proposal. Consume verified outcomes when
available; neither proposal nor native completion is proof of capability.

**Plan prepared; implementation not authorized. Readiness/cutover: BLOCKED
pending the proposed work and its specific approvals. No deployment or work in
another app is included.**
