# Unified full-application handoff

## Scope, authority and result

**Gate-maintenance assessment: PASS.** Independent verification is recorded
separately below; this assessment is not an ordinary validation-tier PASS.

Owner direction in the active conversation: “apply fully Failure Gate Unified
to this project,” followed by “go” after switching from Plan to Build mode.
This authorizes gate completion under the canonical skill's **Installing,
updating and repairing the gate** section. There is no assigned native task for
this direct-maintenance operation; no native number or Unified ID was invented.
No separate bootstrap, signed identity or distributed allocator is required.

Project: CloudPainter. Project-policy/registry identity:
`4b60cdc8-3fdb-439e-b554-21dd7e77a03e`, cross-checked with the supported
current-project task interface and the existing merged package record.
Pre-change source: `17d7fe0e517d78a9dcd996d99253d7dffa573004`.
Date: 2026-10-20 UTC / October 19 in America/Chicago.

## Three distinct baselines

1. **Obligation:** canonical `.agents/skills/failure-gate-unified/SKILL.md`,
   SHA-256 `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`.
   The attached `failure-gate-unified-current-canonical_1792464744209.zip`,
   archive SHA-256
   `e12ef26d91a5f02244b8c54abe278422a242f0451e5965838d0cc13da6c13469`,
   contains exactly the same 22,993-byte definition. No installation, revision
   or pin update is needed. Its bundled planning-only application prompt is
   provenance, not a new rule overriding the owner's later Build instruction.
2. **Pre-change project:** source above; policy active; registry revision 121,
   13 records and no active run; baseline schema 1 with zero entries.
   Protected raw hashes are retained in the companion evidence JSON.
   Empty baseline does not establish a clean historical test baseline.
3. **Delivered:** only the current authoring guide and its detecting gate test
   were changed, plus these handoff/evidence reports. Delivered file hashes
   and maintenance log hash are recorded in the companion evidence JSON.
   Neither an earlier implementation digest nor platform task status is a
   substitute for this measured snapshot.

## Actual changes

- Correct `docs/validation/unified-local-execution.md` from obsolete
  `newPlanTemplate: unified-v3` to policy's current `unified-v4`.
- Include `UNIFIED_CONTEXT_FILE` and Unified preflight explicitly in the first
  authoring example. Explain supported native publication/full readback,
  observed context versus an unobserved local export, placeholder replacement,
  actual bound tier and authorization before dispatch.
- Add **current authoring guide preserves renderer and observed native-context
  preflight** to `scripts/tests/failure-gate.test.mjs`. It reads the actual guide
  and policy and rejects three disposable string mutations: obsolete template,
  omitted context export and omitted preflight. No live resource is modified
  by those controls.

No adopted workload, timeout, capability, application behavior, canonical skill,
current pin, activation marker, historical contract or ledger record changed.
The existing gate implementation was retained rather than rewritten.

## Fixed contract-to-evidence matrix

This matrix fixes the canonical obligations independently of the implementation.
All references to current tests mean the observed maintenance run below, not a
new ordinary task/tier result. Implementation owner: completing Agent.
Independent verification owner: separate read-only verifier, when actually run.

| ID | Canonical obligation / expected outcome | Implementation and acceptance evidence |
|---|---|---|
| U01 | Canonical source and revision pin agree; mismatch stops operations. | `store.mjs` policy check; archive equality; pin-drift refusal fixtures. |
| U02 | Exactly one gate governs new work; old rules are history. | `AGENTS.md`, `replit.md`; retired activation and superseded-alias fixtures; no legacy reactivation. |
| U03 | Supported provisioner generates permanently unique transactional IDs. | `plans.mjs`, `new-plan.mjs`; concurrent allocation/reservation and non-reuse cases. Fixture IDs do not enter the live ledger. |
| U04 | Partial provisioning consumes its reservation without publishing an executable plan. | Provisioning failure and supported completion cases; incomplete record protection. |
| U05 | Cross-checkout merges preserve IDs, tombstones, bindings and history. | `merge-guard.mjs`; lost-record, changed-binding/history and separate-checkout cases. Live registry unchanged. |
| U06 | Four actual registered tiers; choose lightest adequate workload. | Current tier table; `prepare()` selects the first workload containing every inspected required step and refuses no adequate workload. |
| U07 | Exactly one tier per ID; other tiers deny before launch. | `checkPlan` and runner; exact binding/wrong-tier/stale-workload cases. No live wrong-tier run needed. |
| U08 | Tier/scope/contract changes use supported amendment, reseal and applicable approval. | Amendment/preparation/dispatch cases; native identity and old seal protected; no task rebound here. |
| U09 | Baseline is read, valid and matched by exact suite/test/signature. | Current catalog actually read; strict malformed/ambiguous catalog cases and runner matching. |
| U10 | Plans declare ignored versus owned entries, None-known caveat and flaky rule. | Current renderer/spec validation; strict baseline declaration cases. No entry added or reclassified. |
| U11 | Complete plan, baseline and one adequate tier are sealed/guarded before publication. | Provisioning, preparation and strict generated-plan cases; draft/preview is not admission. |
| U12 | Guard validity is not approval or lifecycle permission. | Agent-first host readback procedure and local `NOT_OBSERVED` fields; eligibility/context checks. No platform Start interception claimed. |
| U13 | Pre-implementation task/seal/native-context agreement; missing/stale context denies. | `preflight.mjs`, checked dispatch, expected-native-context and terminal-ID cases; guide now explicit. |
| U14 | Post-Start changes pause affected work, preserve observations and await quiescence. | Dispatch/amendment/retained-lock cases; no concurrent changing-plan execution. |
| U15 | Admission survives restart inputs and fresh processes without machine enrollment. | Existing changed-boot/device and cold-process fixtures; two actual fresh-process read-only probes below. No host reboot claimed. |
| U16 | Provisioner, guards and bound runner work in task checkout/copy environments. | Existing different-path and separate-checkout CLI fixtures transport exact native sealed bytes, retain IDs and deny missing/changed context. Earlier real main-task run is separate evidence, not proof of every platform environment. |
| U17 | Clean finite deadlines and descendant cleanup; uncertain runs never pass. | Existing supervisor deadline, parent death, detached descendant, output limit and retained-lease cases. Maintenance supervisor reports quiescent. |
| U18 | Single flight is per actual target; no duplicate top-level validation. | Target lease/overlap cases, independent-target case retained and actually included. No live lock forcibly reclaimed. |
| U19 | Retries/diagnostics preserve context, tier and provenance; filtered pass is not full pass. | Existing supported isolated retry and stale context cases; no unguarded app checks. |
| U20 | Ignored failures skip; owned repairs must pass; unlisted failures need evidence. | Exact ignored/owned, isolated intermittency and evidence-classification cases; observed raw failures retained. |
| U21 | Retry success alone cannot establish pre-existing provenance. | Explicit passing-retry-not-provenance case; documented-pattern classification separate from fact. |
| U22 | PASS/FAIL/BLOCKED/INCOMPLETE reflect actual completed checks and measured inputs. | Runner raw/assessment and changed-source invalidation cases; current maintenance explicitly not tier PASS. |
| U23 | Authentic owner administrative closure never converts failure to test PASS. | Owner-closure fixtures and fail-closed unavailable live CLI adapter; no administrative closure performed here. |
| U24 | Stale/expired baseline maintenance is warning-only, not automatic blocking/ignore permission. | Baseline warning fixtures; current summary warnings empty. Existing baseline unchanged. |
| U25 | Gate work is scoped, owner-directed, outside ordinary admission and self-tested. | This source-only maintenance; no live allocation, ledger change, ordinary feature work or tier result claimed. |
| U26 | New pin cannot silently invalidate or migrate old sealed revisions. | Current-pin/old-contract fixture; historical renderers/mappings retained byte-identically. |
| U27 | Local task archives are not bulk source deliverables; credentials remain protected. | No `.local/tasks` source additions; credential/NODE_OPTIONS filtering fixture; no secret values read or copied. |
| U28 | Current instructions agree with implementation and name meaningful limits. | New guide/policy/preflight detecting case, with three negative controls; actual unavailable capabilities and cooperative boundary retained. |

For independent verification, inspect the named code and tests rather than
accepting this table as proof. Resolve any method/location changes against the
unchanged canonical obligation, retain original and resolved matrices, record
material differences and block rather than weaken criteria. Recheck source,
report, code and evidence bindings before acceptance.

## Validation and reuse

The previous bound fast-tier run
`e9d4382c-8a4a-416c-86ce-9ab663a60808` was checked before edits: none of its
recorded execution/implementation inputs had changed. Its 152 passing tests
remain historical evidence for that measured snapshot. This change to the gate
test file means it is **not** presented as a fresh current full-tier PASS.
Unchanged workspace, Port Authority and package-integrity checks were not rerun.

Actual current maintenance command:

```sh
python3 scripts/failure-gate/supervisor.py 120000 5000 \
  .local/unified-full-application/gate.log \
  '["node","--test","--test-reporter=tap","--test-timeout=45000","scripts/tests/failure-gate.test.mjs","scripts/tests/check-regression-guard.test.mjs"]'
```

Observed: **113 passed, 0 failed, 0 skipped, 0 cancelled**, about **31.5 seconds**.
Supervisor: exit 0, blocked null, quiescent true. No new current live ID or tier
binding was assigned. The new guide case is sensitive to the specific defect
and its two missing-admission-step variants; the existing full gate/RG cases
remain present and executed.

Additional actual non-mutating checks:

- Two separately started Node processes called `policy(ROOT, true)`,
  `registry(ROOT)`, `baseline(ROOT)` and tier resolution. Both observed ACTIVE,
  the same pin, registry revision 121, 13 records and the same registry hash.
  Inherited step counts: fast 5, standard 17, standard-plus 19, heavy 21.
  This is a cold-process read probe, not a live reboot or new tier run.
- `node scripts/check-failure-gate.mjs`: ACTIVE, `NOT_EXECUTION`, 13 records,
  warnings `[]`.
- Protected raw hashes before/after agree for complete registry, policy,
  tiers, baseline, cutover marker, project instructions and canonical sources.
  All records—including bootstrap, reservations, tombstones and old runs—are
  therefore preserved, not just counted.
- `git diff --check`: passed after the code/guide batch.

The portable lifecycle proof is bounded: tests cover changed boot/device inputs,
different checkout paths, fresh processes, sealed-context transport and actual
checked fixture provision/guard/run operations. A real platform task-agent
launch or live workspace reboot was not performed and is not claimed.

## Recovery and safety

Existing Remix reference is **owner-confirmed**, not independently
Agent-verified: `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`, original anchor
`817e478a886a46ff919d9ff1c681e3d78324406f`. No new Remix was created.
Source-only recovery precaution is the pre-change revision and protected hashes.
An owner-approved recovery may revert these source edits but must preserve all
subsequently consumed IDs, tombstones, bindings and run history.

Database, uploads/storage, browser artwork, secrets and external resources were
not changed or recovery-tested; their backup coverage remains unknown as
documented in `docs/resource-recovery-coverage.md`. No destructive recovery
exercise, production query, provider request, post-merge database hook, live
process reclaim, CI dispatch, deployment or backup retirement was performed.

## Remaining limits and verification routing

- Higher database/browser tiers remain unavailable and fail closed on their
  registered prerequisites. No capability flag, workload or budget was added.
  Their correct denial is gate behavior, not operational certification.
- The previously proposed intermittent-supervision investigation remains
  separate. This passing maintenance does not establish that failure's cause.
- Enforcement is cooperative Agent-first repository admission and checked
  runner/dispatch enforcement, not an editor lock or platform Start adapter.
- Runtime mirror parity/publication was not inspected or changed; canonical
  project source, its pin and implementation are the target here.
- Direct gate maintenance has no native primary task/dependency. The Router's
  durable native-task follow-up route therefore cannot be claimed completed:
  Build mode does not authorize creating project plans/tasks. A saved report or
  helper review must never be represented as a created dependent project task.
  This is a **routing limitation**, not a new canonical requirement for a
  reviewer, bootstrap or redundant cutover approval.

**Independent report:** pending until actually delivered and inspected.
No independent PASS is inferred from the implementer's maintenance PASS.
