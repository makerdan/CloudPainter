# CloudPainter Failure Gate Unified — staged implementation record

## Effective state and authority

**STAGING. NOT ADOPTED. NO CUTOVER.**

The owner explicitly approved the Phase 2 **staged-local** plan in this
conversation. That approval authorizes local machinery, scoped instruction
adaptations and bounded private-fixture verification. It excludes adoption before
acceptance, live-data changes, destructive recovery, service disruption, remote
CI/settings, credentials, provider calls and external copies.

Implementation started from `e7468b62c11a26626a515728a84db2fb88d4010e`, with a
clean worktree. The approved planning inspection was at
`20cbbae08acecaa2df60b38128bca18baa38c5cb`; the actual canonical bytes were
rechecked before implementation.

Target: `.agents/skills/failure-gate-unified/SKILL.md`, installed by
`0b2e94a4f88bae27c296dfdde36b3b29fa9733a2`, SHA-256:
`f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12`.
The canonical Unified definition is unchanged. Runtime mirrors and older/copied
definitions are not authority.

`unified-policy.json` is deliberately `staging`, with no cutover marker and
`allocatorAuthorityVerified: false`. The live provisioner, amendments, closure,
and every tier runner reject execution in this state. Neither a native task
number nor a manually written plan is a valid local authorization.

## Backup and recovery boundary

The Phase 0 record in `docs/resource-recovery-coverage.md` still applies to this
code-only stage. The Remix is **owner-confirmed**, not agent-verified; project
identifier `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`. Its recorded source revision
is `817e478a886a46ff919d9ff1c681e3d78324406f`; the exact copy point is unknown.

Repository/configuration copying is documented, not a complete resource restore
proof. Actual database copy/backup coverage, browser-local artwork, secrets'
values/recovery and external providers remain unknown or uncovered. Current
dotenv ignore rules resolve the earlier record's historical ignore gap.

No application database, browser storage, uploaded artwork, provider, secret
value, deployment, managed workflow, or post-merge hook was touched.

## Approved implementation path and delivery

| Area | Action and implemented path | Enforcement scope / remaining boundary |
|---|---|---|
| Policy | **Adapt** `replit.md`; add `unified-policy.json` | Explicit staging prevents a false adoption statement. Canonical path/hash are checked. No CLI activates policy. |
| IDs and provisioning | Add `scripts/new-plan.mjs`, `failure-gate/{store,plans}.mjs`, `unified-task-registry.json` | Exclusive registry transaction; synced atomic ledger replacement; permanent UUID-based `FGU-` reservations; generated `.local/tasks/` plan. Generation failure retains identity. Persistence uncertainty retains the lock. |
| Binding | Add `unified-tiers.json`, `scripts/check-failure-gate.mjs` | Exactly the four canonical tiers; one recorded binding; plan and complete tier-definition hashes; wrong tier/context/drift rejected before launch. A malformed baseline catalog blocks; maintenance warnings do not. |
| Amendments | Add `scripts/amend-plan.mjs` | Recorded rationale, old/new definition linkage, invalidation before replacement, active/uncertain run denial. A crash can block, never silently execute the new tier. Optional full specification records baseline/metadata changes through the same route. |
| Cancellation | Add `scripts/cancel-plan.mjs` | Keeps identity/events and a permanent tombstone. Cannot cancel active/uncertain owned work. Does not delete plans or native tasks. |
| Runner | Add `scripts/run-validation.mjs`, `failure-gate/runner.mjs`, four package aliases | Re-checks admission inside target exclusion; code-owned argument arrays, no shell expansion; finite cumulative/step/cleanup budgets; raw outcomes separate from assessment. |
| Supervision | Add `failure-gate/supervisor.py` | Linux subreaper, monotonic deadlines, PID-incarnation checks, owned-descendant TERM/KILL/reaping, output cap, parent-loss monitoring. Unobservable cleanup retains exclusion. Cooperative local control, not a hostile-code sandbox or distributed lock. |
| Single flight | Per-target runtime lease under `.local/failure-gate/locks/`; active-run linkage in durable registry | Duplicate same-target runs and amendments fail closed. No age deletion or automatic recovery. Existing declaration lock remains unchanged. |
| Baselines | Add empty `failure-baseline.json`; `maintain-failure-baseline.mjs` | No prior catalog existed. Empty does **not** mean tests are clean. Historical failure reports/plans were neither deleted nor promoted into ignores. Exact suite/test/signature matching and explicit ignored/owned declarations. Stale/expired maintenance is warning-only; stale provenance is not automatically safe to ignore. |
| Failure evidence | Add `retry-validation.mjs`, `classify-failure.mjs` | Code-owned same-tier isolated retry route. Retry PASS never changes full-task assessment. Documented pattern evidence is separately validated/hashed and recorded as inference. Listed failures cannot bypass baseline ownership via self-classification. |
| Completion | Runner assessment plus `close-validation.mjs` | PASS/FAIL/BLOCKED/INCOMPLETE recorded without hiding raw nonzero results. An ignored exact failure can be acceptable while `rawAllPassed` remains false. Owner closure cannot overwrite assessment with PASS; live administrative closure blocks until an authentic host direction adapter exists. |
| Plan guards | **Keep/Adapt** `scripts/validate-task-plans.mjs` | Staging native/legacy repair behavior retained. Unified context requires task ID and exact plan; strict scoped Regression Guard; no mutation of sealed plans or bulk archive rewrite. |
| Legacy prompt | **Supersede** old router `failure-gate` command text | Now a historical alias routing only through explicit adopted canonical policy. Former three-retry/two-factor rule cannot govern new Unified tasks. Original text remains in Git history. |
| Companions | **Adapt** router adoption wording and Regression Guard's sealed-plan wiring | Independent companion obligations retained. Conditional v4 verification profiles remain historical/target-specific, not default Unified policy. These scoped adaptations are not claimed to preserve original package byte parity. |
| Existing callers | **Keep** app commands, CI, workflow configuration, post-merge hook, tests and historical reports | No remote dispatch or settings change. Existing callers are not claimed as Unified-governed merely because the staged aliases exist. |
| Recovery | Add `preview-gate-recovery.mjs` and `failure-gate/recovery.mjs` | Read-only mismatch/omission/conflict preview. Never overwrites the ledger, restores live data, drops identities, or removes locks. |

### Staged tier definitions

- `test-fast`: owning gate fixture suite and Regression Guard tests; 120-second
  total ceiling, 60-second step ceiling, 5-second cleanup allowance.
- `test-standard`: fast plus existing workspace typecheck, drawing-tools and
  API-outline test coverage; 900/300/10-second ceilings.
- `test-standard-plus`: standard plus settings/palettes tests, requiring an
  unavailable verified disposable-database route; 1800/300/10-second ceilings.
- `test-heavy`: plus plus existing build/browser entry points, requiring an
  unavailable disposable-browser route; 2700/300/10-second ceilings.

These are **staged** command mappings and ceilings, not approved production
performance expectations, complete CI coverage or observed runs of all tiers.
Capability names are unsatisfied requirements, not permission flags supplied
through the CLI. Execution children receive a small environment allowlist, not
API/session/database credentials or `NODE_OPTIONS`.

## Supported CLI shape

While staging, live task operations below refuse. Their actual paths are
verified in private fixture roots with copied, pinned source and toy commands.
No compliant live ID was fabricated for the bootstrap.

```text
node scripts/new-plan.mjs path/to/spec.json
TASK_PLAN_FILE=.local/tasks/FGU-….md pnpm run test-fast FGU-…
UNIFIED_TASK_ID=FGU-… TASK_PLAN_FILE=.local/tasks/FGU-….md pnpm run validate:task-plans
node scripts/amend-plan.mjs FGU-… test-standard "recorded rationale" [replacement-spec.json]
node scripts/cancel-plan.mjs FGU-… "recorded rationale"
node scripts/retry-validation.mjs FGU-… test-fast RUN_UUID STEP_INDEX FAILURE_INDEX
node scripts/classify-failure.mjs FGU-… RUN_UUID STEP_INDEX FAILURE_INDEX sources.json
node scripts/maintain-failure-baseline.mjs
node scripts/preview-gate-recovery.mjs path/to/candidate-registry.json
```

Specification: `title`, one `tier`, `why`, `what`, `regression` with `covers`,
`testLocation`, `checks`, and optional `baselines: [{id, kind: ignored|owned}]`.
Every required field must be filled. Optional native linkage is metadata, not an
authorization; the candidate legacy task cannot be retroactively bound.
Documented-pattern evidence uses `type`, repository-relative `file` under
`docs/validation/`, and an actually observed `quote`. No original receipts are
required. Unsupported/unrecognized failure output remains fail-closed.

## Preserved in-flight state

- Native **#2** sketch recovery: unchanged ID/contract; no local gate ID or tier
  invented. Preserve explicit opt-in, local copies, account isolation, verified
  storage prerequisites and disposable validation. Candidate legacy metadata
  does not implement a bypass or change native task state.
- Native **#13/#14** proposed Port Authority confirmation/verification: untouched
  IDs, dependency and scope. Scheduling after future cutover requires separately
  provisioned Unified context, not silent rewriting.
- Installation tasks **#5/#7/#9** remain installation records, not adoption or
  local gate authorizations.
- Historical Core/v4 plans, IDs, bindings, logs and tombstones remain untouched.
  No `.local/tasks` archive was bulk-committed.

Re-read live native task state before any cutover. Only explicitly preserved
in-flight contracts may finish through a legacy/native path. New tasks cannot
enter that allowlist.

## Verification and Regression Guard

**Covers:** permanent identity, wrong-tier dispatch, amended plan/binding drift,
legacy isolation, uncertainty after interruption, surviving descendants,
baseline over-ignore, retry-as-provenance, skipped checks and false PASS/closure.

**Test location:** `scripts/tests/failure-gate.test.mjs`, plus existing
`scripts/tests/check-regression-guard.test.mjs` and
`scripts/tests/workspace-typecheck.test.mjs`.

**What it checks:** real CLI/private fixture provisioning and runner paths;
all four recorded-tier successes and all twelve wrong-tier denials before launch;
concurrent reservations; failed generation; cancelled/deleted plan non-reuse;
documented amendments; traversal/symlink denial; same-target exclusion; timeout,
parent death and detached-child cleanup; unrelated-process preservation; stripped
credential environment; raw-result/assessment separation; exact baseline matching,
owned repair and ambiguity; isolated retry and separate evidence; retained
uncertain leases; administrative-closure denial without authority; read-only
recovery omission detection. Existing guard/typecheck regressions remain covered.

Runs use an independent outer Python supervisor, explicit Node test timeouts,
private filesystem fixtures and owned disposable processes. Generated logs are
under ignored `generated-artifacts/unified-staging/`; their existence is not a
verified durable backup.

### Observed verification results

| Check | Observed result |
|---|---|
| First bounded bootstrap pass | **FAIL:** 43/45 passed; two new failure-classification cases failed because Node emitted human-readable output rather than TAP. No failure was ignored. Existing guard/typecheck cases passed. Outer cleanup was quiescent. |
| Corrected owning suite | **PASS:** 22/22 after explicitly selecting the TAP reporter. |
| Final coherent local pass | **PASS:** 50/50, zero failed/cancelled/skipped, 12.666 seconds; includes 26 gate cases and 24 existing guard/typecheck cases. Supervisor exit 0, no deadline violation, owned work quiescent. |
| Live control inspection | **Confirmed:** `mode: staging`, `assessment: NOT_EXECUTION`, registry count 0, no maintenance warnings. Inspection is not passing live-tier execution. |
| Source whitespace check | **PASS:** `git diff --check` on the final measured implementation. |
| Public app preview | **Confirmed:** anonymous CloudPainter root rendered at 1280×720. No sign-in, edits, uploads or restore interaction. Development-key/WebGPU warnings appeared; this is a public smoke observation, not gate or user-journey acceptance. |
| Live provisioning, all real tiers, CI and administrative closure | **BLOCKED / not run:** staging, authority/capability/caller/adapter prerequisites remain unresolved. No skipped or unobserved run is called PASS. |

Final source base remained
`e7468b62c11a26626a515728a84db2fb88d4010e`. The source identity manifest is
`unified-staging-source-manifest.sha256`; it excludes this record and the manifest
itself, avoiding self-referential hashes. Subsequent documentation/memory-only
additions do not invalidate the measured runtime/tests.

Raw final evidence:

- `generated-artifacts/unified-staging/final-local-suite.log`, SHA-256
  `85a5e4fe29fc60c40ff5a377bd2cc7d9cb63467ba94692b66fbc1b034a226ac8`
- `generated-artifacts/unified-staging/final-local-suite-supervision.json`,
  SHA-256
  `5b1cee2800e1da29e8d07a90f45139551ed9dc9f69219cdd7b2a9222a98fdfa3`

The platform reported native sketch-recovery task #2 as **IMPLEMENTED** during
this stage. That update is not a merged-resource backup proof and does not
authorize changing its ID/contract. The legacy entry remains candidate metadata
only; reconcile current state before activation rather than treating it as an
active exception.

**Result:** local staging verification PASS for the named scope; application-wide
Unified adoption/cutover **BLOCKED**. No live task ID was allocated.

## Cutover blockers and next acceptance boundary

1. **Authoritative allocation across hosts/isolated task copies is unverified.**
   Path/project-ID checks are local cooperative checks, not authentic central
   host attestation. The live authority flag remains false.
2. **Whole-caller coverage is incomplete.** CI and existing independent scripts
   are preserved, not routed through a task-specific checked ingress. Verify
   context transfer, hook/pre/post/nested coverage, and exact suite mapping before
   adoption. Remote work needs specific approval.
3. **Resource capability routes are absent.** Plus/heavy cannot use a live DB or
   authenticated browser as an unverified fallback. Current child environment
   intentionally cannot inject those credentials.
4. **Durable evidence/recovery needs acceptance.** Metadata is versioned; run
   logs, target leases and local plans are environment-local. A real recovery
   route must fence allocation and reconcile all identities/tombstones before
   restoring state. Read-only preview is not successful restore proof.
5. **Host administrative-closure adapter is absent.** The CLI refuses forged
   flags/files. Fixture resolver tests do not establish native completion wiring.
6. **Failure-adapter coverage is partial.** Flat Node TAP output has exact
   matching; nested/unrecognized formats and non-TAP failed commands are not
   guessed or blanket-ignored. Complete relevant adapters before claiming the
   full project contract.
7. **Independent acceptance and fresh task reconciliation are pending.**
   Definition hash, local fixtures and native merge status are not adoption.
   Port Authority package delivery/readiness is outside this stage and already
   has separate confirmation/verification proposals.

Only after those boundaries are resolved and cutover is explicitly approved:
freeze the source/definitions, prevent competing provisioning, confirm owned
work is quiescent, finalize only necessary in-flight exceptions, atomically mark
the policy active with revision/evidence linkage, and state in project
instructions: **Failure Gate Unified governs new tasks from this point forward.**
Repeat actual admission checks on that exact snapshot. Do not let both policies
govern a new task or permit an unenforced tier.

## Rollback / recovery without live overwrite

- Before adoption: leave `staging` and preserve diagnostics. Scoped source
  rollback must preserve registry records and evidence; do not revert a ledger
  with newly consumed IDs merely to restore code.
- After an unsafe activation: stop new admission through the authorized policy
  route, retain active/uncertain-run exclusion, and reconcile current ownership
  before any recovery. Do not age-delete locks.
- Use read-only preview first, then separately authorized isolated copies for
  reconciliation. A stale candidate that omits an ID/tombstone cannot overwrite
  current state. Do not test this against the live app database or user storage.
- App-data restore, ledger replacement, task closure/replanning, state deletion,
  baseline pruning, service disruption, secrets, external copies and remote
  actions require specific approval. No such action occurred here.
