# Regression Guard revision application handoff

## Scope, authority and revision binding

- Project: CloudPainter, policy projectId `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`.
- Approved native task: **49, Apply updated Regression Guard**, full frozen plan
  reproduced below. `.local/tasks/task-49.md` at execution had SHA-256
  `04675cf369f30d5b82f03932d29d8a03b1534dffa6674518651b7f5935aeecd0`.
  This report is the tracked handoff, not the environment-local archive.
- Planning anchor was `14d7fabba24b72181394fcd8d8fe3a17cfd620c9`.
  Actual implementation base was `90d1326ae0d66347b2d600ca7d34112645328ca6`;
  the working tree was clean before edits. The delivered snapshot is that base
  plus the scoped source manifest below, not the older planning anchor.
- Authorization is the assigned owner-directed gate-maintenance task and the
  active conversation. No live gate ID, tier assignment, new approval registry,
  native-task binding or live ledger mutation was used.
- Backup prerequisite: the executor paused before edits; the owner replied
  **“yes its ready”** to the request to create the Remix backup. This is owner
  confirmation, not independently inspected copy contents or resource recovery
  proof. No uncertain earlier Remix provenance was reused.
- Current platform task context showed shared Unified preflight task **46**
  PROPOSED, not concurrently executing. Its draft local plan was inspected
  (`failure-gate-unified-apply-20261018.md`, SHA-256
  `3b382b2260d57a9a18ad3f66c343cbfcfb078754ed96082c579409c557bd0371`).
  No delivered shared dispatch hook was found. The existing Unified canonical
  source/pin was retained, not replaced with the draft's intended revision.
- Mandatory executor assessment: **normal coverage**, covering existing
  admission/execution behavior, compatibility, integrity of sealed plans/history,
  and owning-run lifecycle. Adding tests alongside those changes is not
  self-satisfaction. No task-owned N/A or deferral was used.
- Separate read-only application review: **not selected**. File-only source
  confirmation, this executor assessment, maintenance validation and the
  platform's task completion checks are different things.

## Source/install baseline and adoption

The source package and its acceptance table were read independently of the
older installer claims. All five ZIP members passed CRC/integrity inspection.
The installed canonical entry and references match the selected ZIP members.
No alternate skill source, mirror, catalog, canonical skill rewrite or Unified
pin change was made.

| Input | SHA-256 |
|---|---|
| `attached_assets/regression-guard-skill_(10.18.2026)_1792369873490.zip` | `01fe5e8c0606f8f92e1a55b9ea3ca35f392fa4396993ba6e23ace959450621c1` |
| `.agents/skills/regression-guard/SKILL.md` | `6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1` |
| `reference/enforcement-contract.md` within that canonical package | `bdae119a887cda74dadbc6fded7ff7360e94c54fb57a858756ee4fdfa192d964` |
| `reference/delivery-handoff.md` within that canonical package | `2df6f93305e3757989bff36be1ab1bc7cc9deb3229ad703cec83e3ef1a4c9910` |
| `.agents/skills/failure-gate-unified/SKILL.md`, unchanged policy pin | `73254fc29ec62a3966fd16508ec20dcac6cc676f65fa309a5365d400dcccf2cc` |

Cutover mechanism: `unified-policy.json.newPlanTemplate = unified-v4` with an
independent `regressionGuard.contracts` map keyed by sealed Unified
contract/representation. Known legacy-v1/unified-v2/unified-v3 combinations map
to the immediate pre-cutover `legacy-v1` checker; unified-v4 maps to the selected
RG fingerprint. Historical renderers, old plan fields and recorded mappings
remain unchanged. This does not assert that an unknown record used that old
policy: unknown mappings fail locally. A supported amendment adopts current
rules without inventing an identity or changing tiers by implication.

The existing valid baseline catalog has zero entries. That fact is not a claim
about unexecuted historical product checks. Pre-edit maintenance was observed
separately below.

## Delivered boundaries and cases

Implementation locations:

- `scripts/failure-gate/regression-contract.mjs`: adoption/source closure,
  scope/coverage-map consistency, factual-exception evidence shape, fresh trusted
  deferral resolution, explicit Node workload inclusion.
- `scripts/failure-gate/plans.mjs`: revision-aware provision/amend/check and
  read-only RG preflight; new representation seals the assessment and deferral
  context in Markdown. Legacy renderers are retained.
- `scripts/failure-gate/runner.mjs`: checks the applicable declaration, fresh
  deferral and workload inclusion both before and inside the existing target
  lease, before any workload.
- `scripts/check-regression-guard.mjs`: current versus historical scope checks;
  selected sealed plans delegate to their recorded admission contract;
  `--fix-stub` is disabled. No native draft-status resolver exists, so no draft
  writing helper is offered.
- `scripts/validate-task-plans.mjs`: read-only bound check, no repair loop or
  second newest-linter pass over a historical seal.
- `scripts/check-regression-preflight.mjs` and CLI action: observed-plan-hash
  check and local RG assessment component, not a generic host dispatcher.
- `AGENTS.md`, `regression-guard-authoring.md`, `unified-local-execution.md`,
  `replit.md`: Agent-first scope/authorization assessment, gap preparation,
  supported amendment, current-revision recheck, pause/preserve/renew flow,
  delivery obligations and exact cooperative limits.

All case names below are in the two authorized owning suites:
**G** = `scripts/tests/check-regression-guard.test.mjs`;
**F** = `scripts/tests/failure-gate.test.mjs`.
All final observed results apply to the delivered implementation manifest.
These are gate-admission/backend-process fixtures or source/instruction
assertions, not tests of CloudPainter product behavior.

## Original requirement → actual delivery

The frozen plan below preserves the original map without weaker replacement
criteria. This resolved map records actual assertions and limitations.

| ID | Status | Actual cases, assertion and layer | Evidence and disposition |
|---|---|---|---|
| R01 | Completed, cooperative semantic assessment retained | G `current scope classification rejects executing DELETE and admission/test-title bypasses; old rules remain explicit`, existing eight natural-language material-risk cases; F `current RG maps all eight material categories…`, `current RG rejects title/metadata escapes…`. Current executing removals, changed admission/execution, mixed risk/exclusion, negation and quoted examples cannot claim the old title escape. Whole-scope additive/cosmetic/internal/deletion-marked/test-only inputs round-trip separately. | Final maintenance PASS. Current scope ignores generated assessment metadata; supplied rationale/risk map is sealed and inspected. Keywords are bounded contradiction checks, not a complete classifier. The executor must still discover omitted material scope and assess each category. |
| R02 | Completed | G duplicate/mixed/missing/placeholder/placement cases; F `current RG rejects all malformed sections before every execution caller…`, `multiple risks need distinct mapped assertions…`, normal CLI round-trip. Missing coverage, unequal boundary labels, unrelated assertion text, bare directories and unknown/duplicate risk labels refuse admission. Future paths are admitted at planning; mapped existing cases need no redundant test. | Final PASS. The fixture's observable recurrence is invalid admission: assert a refusal and absent launch sentinel, not a string-only implementation assertion. Human review must establish actual layer semantics and detection; equal layer strings are not proof. |
| R03 | Completed | F `current RG admits factual N/A for all four categories and whole-scope self/exclusions…` provisions and amends all four exception categories, plus pure tests/verification and all exclusions. Negative cases reject difficulty-only or missing factual evidence and self mode on material work. | Final PASS of exception input protocol, not factual claims about live services. N/A requires risk-complete facts, alternatives and residual risk; executor instructions require inspecting real harness/narrower alternatives and guarding surviving removal effects normally. This task uses normal coverage, not N/A. |
| R04 | Completed within supported resolver boundary | F `current deferrals use stable host refs and fresh commitment/scope/ownership at publication execution and delivery`. Non-numeric stable ref, trusted resolver, committed/eligible host decision, exact project/ref/owner/recurrence and approval/commitment are tested; proposed/cancelled lifecycle disposition is represented by host `eligible=false`, not invented universal status names. Null/inaccessible evidence, scope loss, missing ownership, changed revision and missing resolver refuse. JSON resolver receipts cannot install the adapter. | Final PASS. No actual application deferral was accepted and no live host integration is claimed. Existing CLI has no authentic resolver and fails closed. Programmatic recheck at delivery uses checkPlan with the trusted resolver; historical deferrals retain old semantics. |
| R05 | Completed | F current normal/N/A/self/excluded provision/amend cases; `current RG rejects title/metadata escapes…` snapshots the old ledger/seal before each failed amendment, asserts exact equality, checks consumed incomplete IDs have no published plan, and preserves sibling bytes. Existing transactional identity/tombstone tests remain. | Final PASS. All allocations are disposable fixture identities. The live registry did not change. Invalid pre-reservation input consumes no ID; post-reservation failures retain incomplete identities, never admitted plans. |
| R06 | Completed | F malformed execution caller cases invoke check, wrapper, selected sealed checker, run and tier CLI, plus direct programmatic run; all refuse before launch/run directory and preserve seal/registry. Existing wrong-path/non-md/missing/directory/sibling cases remain. G fix-stub tests assert disabled mode leaves all targets unchanged. | Final PASS. No automatic repair remains; no draft helper is installed. Wrapper returns after applicable revision validation, avoiding newest-rule reinterpretation of old seals. |
| R07 | Completed via selected Agent-first route | F `Agent-first RG preflight reuses valid plans and detects native mismatch/stale revision; amendments require quiescence` exercises local CLI/programmatic preflight; valid reuse leaves ledger untouched, native sealed-text mismatch/stale hash refuse; adequate concrete replacement uses supported amendment. G instruction assertions require Agent-first assessment/handoff without invented independent acceptance. | Final PASS of controlled local component. AGENTS requires first-action actual scope/adoption/revision/binding/host authorization and lifecycle assessment, concrete gap preparation, only covered amendments, requests only for uncovered authority, and immediate revision recheck. Task 46 remains general dispatcher owner. No hook or host authorization adapter is invented. |
| R08 | Completed via existing amendment route plus Agent procedure | F same preflight case asserts active/uncertain owning run and target lease refuse amendment, then permits it after genuine fixture quiescence; preserves a prior-observation file and rejects old revision on resumption. Existing runner concurrency/timeout/uncertain-child cases remain. | Final PASS. Instructions pause only affected work, retain changes/observations, prohibit lock deletion or fictional cancellation, re-admit, reassess prior edits and renew affected evidence without retroactive certification. No live run was cancelled or process reclaimed. |
| R09 | Completed | F `RG adoption preserves historical rule bytes; unknown mapping is local and amendments adopt current rules`, existing historical renderer and merge-history cases. Old seal/record stays identical after adoption; removing only its mapping refuses only that plan while independent current provision succeeds; supported amendment adopts v4 and keeps workload hash. | Final PASS. Independent mapping is explicit in policy; live registry, baseline and tier bytes match pre-edit hashes. No blanket grandfathering, historical normalization or archive-wide rewrite. |
| R10 | Completed, narrow mechanical coverage documented | F `current workload inclusion is explicit; missing coverage blocks dispatch without tier mutation` asserts absent sentinel for an unlisted file, unchanged tier bytes, same-tier supported correction and an observed disposable PASS with activeRun released. Extra application arguments, import filenames and opaque pnpm aliases cannot masquerade as direct file execution. | Final PASS of local inclusion check. The actual unchanged test-fast workload explicitly names both delivered suites and is inherited by higher tiers. This maintenance runs those suites under the approved exception, NOT a live assigned-tier PASS. Opaque aliases need owning coverage integration or honest missing-coverage resolution; inclusion is not semantic adequacy. |
| R11 | Completed for this deliverable | This tracked report binds the native plan, canonical closure/adoption, normal recurrence cases and backend assertion layer, tested source manifest, observed results and preserved bytes. Safe negative/equivalent evidence below explains which assertions fail for the previous bypasses. | Final maintenance PASS. No planned-but-missing guard, substantiated N/A or deferred material recurrence remains in this task. Valid-plan markers, source presence and fixture PASS do not certify another task's actual guard delivery. |
| R12 | Completed | G canonical/source-contract cases reject blanket mandatory unselected review, including injected negative source fixtures; `Agent-first instructions require assessment and handoff, never unselected independent acceptance` inspects actual AGENTS/authoring instructions and rejects injected mandatory acceptance. | Final PASS. Separate application review is **not selected**, not blocked/pending. Historical report kept unchanged. No review task/service or recursive verifier was created. Completion review performed by the platform callback is not claimed as optional application verification. |

### Safe negative controls and executor detecting-assertion assessment

- Executing DELETE removal: G calls the retained legacy decision on the same
  input (no violation) and the current decision (missing guard refusal). Restoring
  the title exemption fails that current assertion; no live unsafe behavior is
  introduced.
- Missing/mixed/placeholder coverage: G/F supply malformed declarations and
  synthetic earlier-admitted invalid seals only inside disposable roots.
  Removing the current shared guard makes the expected refusal fail and, at
  execution boundaries, permits the fixture sentinel the test asserts absent.
- Scope/layer/multi-risk coverage: F asserts rejection for mismatched layers and
  uncovered second risk. These are precisely the invariants absent from the old
  shape-only checker; removing those checks fails those assertions. Executor
  inspection confirms these cases exercise the admission boundary directly.
- Deferral freshness: the resolver is made unavailable, scope-lost, ineligible
  or changed after sealing. Accepting memoized evidence again would violate
  `assert.rejects(run(...))` and the absent-sentinel assertion. This is a safe
  simulated host boundary, not evidence of a production host adapter.
- Read-only validation and failure atomicity: every negative call compares exact
  original seal/registry/sibling bytes. Reintroducing repair or candidate
  publication on failure breaks these assertions.
- History: old/current/unknown mappings and the historical sealed bytes are
  checked independently. Applying current requirements to an old seal or
  defaulting an unknown mapping would fail a positive/negative assertion.
- Quiescence/stale context: existing activeRun and target lease are installed
  only in the fixture; permitting amendment during either conflict or accepting
  the prior hash after amendment fails the corresponding assertion.
- Workload inclusion: a valid planned file absent from the bound Node workload
  is offered for run; bypassing inclusion produces a sentinel where rejection
  and absence are required. Same-tier correction positively proves the boundary
  is not simply refusing all execution.
- Optional review: injected blanket mandatory-review text makes the actual
  instruction/source assertion fail. No separate reviewer is required to
  establish this executor's evidence.

These controls and equivalent assertion reasoning concern the named cooperative
boundaries only. They do not prove arbitrary natural-language classification,
actual future N/A facts, an assertion's semantics merely from strings, or
delivery of another task's tests.

## Maintenance observations

The exact approved full command, run one top-level invocation at a time:

```sh
timeout --signal=TERM --kill-after=5s 180s node --test --test-reporter=tap --test-timeout=45000 scripts/tests/check-regression-guard.test.mjs scripts/tests/failure-gate.test.mjs
```

| Observation | Actual result | Raw TAP reference / fingerprint |
|---|---|---|
| Before edits, base above | exit 0; 68/68 passed; no skipped/cancelled/timeouts; 16,536.594353 ms | `/tmp/rg-maintenance/before.tap`, `310caf2db2573e739414029a74689127d762a4dc7a0c78c654c9e48161644e26` |
| First integrated run | exit 1; 75/77 passed, two task-owned failures; 21,480.429298 ms | `/tmp/rg-maintenance/after.tap`, `4236320248dfdf4c76e5112964ba16203e84a4c430006f8773af03529a3fef33` |
| Bounded diagnostic with `--test-name-pattern='current RG maps\|current RG admits'` inserted before suite paths | exit 1; 2/3 passed; isolated cosmetic exclusion exposed generated assessment-heading contamination | `/tmp/rg-maintenance/diagnostic.tap`, `72af69c227d290cff46c06336a51922879da0a9418259aac8eaea09f7e531757` |
| Repaired integrated run | exit 0; 78/78 passed; no skipped/cancelled/timeouts; 24,972.686142 ms | `/tmp/rg-maintenance/final.tap`, `2818494b39035aedd1c216fa99ba4114db236b8b13ee0a2bd25bf50f69b0d36a` |
| Delivered code and all final guard cases | exit 0; **79/79 passed**; zero failed, skipped, cancelled or timed-out tests; 25,201.374866 ms | `/tmp/rg-maintenance/delivery.tap`, `2fb82d6cc7936ff5ff946a63d66ab2e5aa20b862b47b51d9f017aad8983b6a35` |

The initial failures were not baseline failures or waived by retry: selected
sealed-checker delegation supplied an absolute path to a relative-path-only
bound checker, and generated assessment prose contaminated scope classification.
The selected path is now converted to repository-relative context; assessment
metadata is masked from actual scope. Genuine unchanged test-only scope is also
recognized without relying on a test-oriented title. Subsequent source changes
added the explicit instruction-negative control and tightened Node workload
argument handling; their final observed run is appended below.

**Maintenance outcome: PASS**, not a live task-tier PASS. No required maintenance
check is skipped, unobserved, deferred or failing. No product/build/browser suite
was required or run. The final result renews the affected code evidence after
the instruction-negative control and workload argument changes.

### Tested implementation manifest

These hashes pin the executable/tested part of the delivered diff relative to
the implementation base above. Documentation changes after the last run only
record its observations; they do not change the measured guard code.

| File | SHA-256 |
|---|---|
| `scripts/check-regression-guard.mjs` | `eb4e418c7accb3f517574cbb8c51d55363c64986f6aa3e101b529b7e1d66db51` |
| `scripts/validate-task-plans.mjs` | `3c54d5cd2b1428d85e92810eeeace700d849fc4d64c4aedba4ed3d8e16a94b4f` |
| `scripts/check-regression-preflight.mjs` | `0858dcae31a2c95bf66705eee926d8ffca6274ca191a00d5ee5bc2a9ef1272b4` |
| `scripts/failure-gate/plans.mjs` | `6641da8448baf41c5320d7c07dec96bc08703ddd3d389d68291a3618fd49c0c9` |
| `scripts/failure-gate/regression-contract.mjs` | `a0c94cef50b53ce0079ce6bbaec4f8a5a679849036e3ea86f835a302bd91bd42` |
| `scripts/failure-gate/runner.mjs` | `fbdd879b44387992e64f6d78c44750a901765152154f4aa2d11170641c2f9663` |
| `scripts/failure-gate/cli.mjs` | `9b3df92d23a0179d31c5d4265e7cb98bd20644aad873ac182083fa9000ec4264` |
| `scripts/failure-gate/execution-sources.mjs` | `a4b58c0b1a8d6831da8fd7c4ac07e7b4c54dac19d5b483fbebc3b22fdebfd4fb` |
| `scripts/tests/check-regression-guard.test.mjs` | `dd9b72a682e15beb7f4ba7083b64607efbe96878c3d227f5de80ec475ff68842` |
| `scripts/tests/failure-gate.test.mjs` | `e01b2f8fbe00eeaa83230a65e84631ff6aeef388d7341c8dab12ac044158b51b` |
| `docs/validation/unified-policy.json` | `71cfc5d383a17254abff3bc8a9e3bd5a86fdc727fdac9cf928ea3f089de7d56f` |

Required fixture process-tree cleanup is tested by the owning suite. The outer
timeout returned normally; post-run process inspection found no remaining
`/tmp/cloudpainter-gate-*` or `/tmp/regression-guard-*` fixture children.
No app services, product/browser tests, database/provider calls, deployment,
remote workflows, post-merge hooks, live tiers or arbitrary process cleanup ran.

Raw `/tmp` files are supplementary session artifacts, not the durable handoff.
The counts, observed failures/repairs, command, snapshot fingerprints and case
assertions here preserve the evidence when those logs expire.

## Preservation and actual cooperative caller coverage

Pre/post exact SHA-256:

| Unchanged live input | SHA-256 |
|---|---|
| `unified-task-registry.json` (IDs, reservations, tombstones, bindings, events and recorded runs) | `bf86826d6a3a758900e309018a9c261130917059c13590a0d9fc4b506319a1a0` |
| `failure-baseline.json` | `352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871` |
| `unified-tiers.json` (every actual workload and budget) | `65b976cda35e5283ec8492582964b194cfa9babf4b6b39afe4ae4f2fbd8b42a5` |

Enforced: local new-plan/provision, amend-plan/amend, bound checkPlan,
check-failure-gate, validate-task-plans, selected sealed check-regression-guard,
run-validation/run, validation-tier, and the RG-only preflight CLI/helper.
Retry inherits bound run admission. Unsealed/offline lint is not authoritative
publication or host authorization. Summary mode is not execution.

Not intercepted: Replit native Start, arbitrary editor/shell changes, native
task publication/completion, remote CI, unavailable host task/approval adapters,
or another task's actual guard delivery. Agent-first host review supplies the
required semantic/authorization/lifecycle assessment; the helper explicitly
reports `PLAN_VALID_NOT_DELIVERY_OR_HOST_AUTHORIZATION`. It does not claim an
atomic platform implementation lease. Native text comparison is possible only
when the executor has the authoritative text; a mutable description is not a
seal. Supported amendments retain existing Unified quiescence rules.

No general dispatch implementation was added in parallel with task 46.
No automatic separate verifier was created. Existing planned shared Unified
preflight work owns that next integration; no overlapping follow-up is proposed.
The scope's CLI-deferral and opaque-workload limitations are explicit supported
refusals, not fictional delivered adapters or application task validation.

## Frozen complete native plan

The following preserves the approved original requirements and boundaries.
It is history of this assignment, not a second currently active gate policy.

````markdown
# Task #49: Apply updated Regression Guard

# Apply Updated Regression Guard

## Latest attachment reconciliation
The owner requested this plan update using attached_assets/regression-guard-skill_(10.18.2026)_1792369873490.zip. Its ZIP bytes exactly match the previously selected upload (SHA-256 01fe5e8c0606f8f92e1a55b9ea3ca35f392fa4396993ba6e23ace959450621c1); archive integrity checks passed for all five members. This replaces the source attachment reference only. The full specification, expected source digests, acceptance criteria, validation boundaries and existing dependency order remain unchanged. This plan revision does not authorize implementation or claim application tests passed.

## What & Why
Apply the owner-selected Regression Guard revision to CloudPainter's existing cooperative repository enforcement after its canonical definition and references are installed and confirmed. Task #39 delivered the older contract; do not repeat it or revive archived follow-ups. Complete only the new contract's gaps, with a revision-bound requirement-to-delivery handoff and truthful enforcement limits.

This is owner-directed gate maintenance under the canonical Failure Gate Unified update/repair exception. Do not allocate a live gate ID or modify live ledger records. Optional separate read-only application verification is not selected; do not automatically create a reviewer, impose independent acceptance or describe absent optional review as blocked. Mandatory executor assessment, actual maintenance validation and the file-only installation confirmation remain distinct.

## Done looks like
- New/current-contract plans represent normal coverage, factual N/A, genuine whole-scope self-satisfaction, supported verified deferral and excluded work without forcing all tasks into a normal declaration.
- Scope-based classification includes every material component. Executing a material change cannot evade coverage through DELETE/test-oriented titles, negation, quoted examples, unrelated exclusions or arbitrary metadata.
- Supported provisioning, amendment, explicit validation and bound execution reject invalid current declarations before publication/workload dispatch, without rewriting admitted plans; failed amendments preserve the old admitted revision and binding.
- Regression Guard is assessed before implementation through the real shared preflight if delivered or the Agent-first cooperative route. Adequate plans are reused; gaps prepare concrete coverage and use only supported authorized amendments, with current revision checked before resumption.
- Historical plans, recorded contracts, IDs, reservations/tombstones, bindings, baseline records, ledgers and tier workloads remain intact. New Regression Guard rules have an explicit adoption/revision mapping rather than silently applying the newest checker to every old seal.
- A tracked requirement map records actual cases/assertions, affected layers, tested snapshot/results or substantiated exception/deferral evidence. It distinguishes valid plans, delivered coverage and observed execution; review selection is explicitly not selected.

## Out of scope
- Definition rewrites, alternate skill sources, runtime mirrors/catalog updates, retired-policy reactivation and automatic separate application verification.
- Product/API feature changes, account backups or analytics changes, database/provider calls, live accounts/artwork, application builds, browser services, deployments, remote workflow operations or arbitrary process cleanup.
- Live gate-ID allocation, retroactive native-task binding, ledger migrations/reset, archive-wide rewrites/reconstruction, new tiers, workload changes, machine-bound identity, a second approval registry or semantic-proof claims for keyword lint.
- The general Unified preflight/dispatch/authorization/lifecycle system already planned in task #46. Reuse its actual delivered routes when available; do not implement a competing generic system here or make unaccepted task #46 a fictitious prerequisite.

## Steps
1. **Reconcile sources and owning boundaries** — Read the full delivered canonical package and required references, current governing policy and all current task records affecting shared gate files. Compare the fixed requirement map with actual delivery from the definition tasks and task #46; preserve already-correct work, collect a bounded maintenance baseline and establish the supplied prompt's Remix-backup prerequisite before integration edits through a supported route or owner action.
2. **Adopt a revision-safe contract** — Record the Regression Guard cutover using compatible policy/plan-contract evolution for newly governed plans, keeping historical representations and known mappings unchanged. Extend only supported provisioning/amendment inputs and revision-bound classification evidence needed for all permitted forms, material-risk maps and justified exclusions; unknown historical mappings stay local unresolved cases, not blanket blockers or assumed exemptions.
3. **Complete consistent declaration admission** — Apply the same tested decision across current candidate publication, amendment, plan validation and bound execution, replacing title-based escapes with inspectable scope rationale and accountable semantic assessment. Separate mechanically checkable contradictions from human assessment of layer, detecting assertion, N/A facts and full risk coverage; preserve strict single-target diagnostics and prohibit validation-time stub rewriting.
4. **Integrate Regression Guard preflight and amendments** — Add Regression Guard assessment/preparation to the shared preflight when actually delivered; otherwise make it the executing Agent's first action using existing supported admission/amendment routes, not an invented hook. Reuse valid plans, reconcile native descriptions with authoritative seals when host tools support it, pause affected work for mid-task gaps, verify quiescence and current revision, and request only genuinely uncovered authorization before resuming.
5. **Verify exception and delivery evidence** — Use trusted available host evidence for deferral ownership/commitment and recheck it before execution/delivery; preserve fail-closed behavior when a caller lacks an authentic resolver. Establish the required revision-bound handoff for every material recurrence, factual exception and residual risk, including actual test inclusion in the unchanged assigned workload and a safe negative control or equivalent detecting-assertion evidence.
6. **Prove adoption and report limits** — Exercise the entire applicable acceptance table through owning entry points in disposable fixtures, preserving expected refusals, absent workload sentinels and unchanged sealed bytes/history. Publish the requirement map, source/adoption revisions, actual caller coverage, observed maintenance outcomes, deferred/unverified items and the exact cooperative boundary; never infer platform Start interception, complete semantics or guard delivery from a syntax pass.

## Project, inputs and task coordination
- Project: CloudPainter; https://github.com/makerdan/cloudpainter; policy projectId 4b60cdc8-3fdb-439e-b554-21dd7e77a03e; inspected root /home/runner/workspace. Starting snapshot: 14d7fabba24b72181394fcd8d8fe3a17cfd620c9.
- Approved archive: attached_assets/regression-guard-skill_(10.18.2026)_1792369873490.zip. SHA-256: 01fe5e8c0606f8f92e1a55b9ea3ca35f392fa4396993ba6e23ace959450621c1. Entry point SHA-256: 6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1. Read its complete enforcement-contract and delivery-handoff references; the complete package specification is also preserved in the definition primary's full native plan.
- Canonical source and applicable references, not installer claims, determine the original requirements. Pin the finalized native plan/ref and source manifest in the execution handoff. Source/install baseline, original obligations and delivered implementation are distinct; expected authorized delivery is not automatically contract drift.
- Task #46 currently has a draft plan for shared Unified preflight and a different canonical skill revision. It is not an accepted dependency. Re-query it before editing shared files; use delivered work and its real policy pin if available, never revert it to the older inspected snapshot. Do not run conflicting shared-file implementations concurrently: resolve scheduling with the actual task context; an unresolved concurrent change is a specific coordination blocker, not permission to overwrite.
- This task does not update the Unified definition or its pin. Preserve whichever owner-authorized Unified revision is actually adopted at execution. Native API task proposals are not Unified gate IDs or permission to forge bindings.
- Delivery destination: docs/validation/regression-guard-revision-application-handoff.md. Preserve the complete native plan, source/reference manifest, approval scope, original/resolved requirement map, implementation snapshot, actual entry points and observed results there during execution; local submission files are not the durable report.

## Fixed requirement-to-delivery map
Every row needs actual files/cases/assertions or substantiated exception evidence, snapshot/result references and completed/failed/blocked/justified-N/A status. Do not derive weaker criteria from installed output. Read the full reference acceptance table as well as these grouped labels.

| ID | Required outcome and initial gap | Planned guard / evidence |
|---|---|---|
| R01 | Classify all eight material categories by actual scope; cover every material component. The current checker still has DELETE and test-title heuristics. | Checker/current-input fixtures for all categories, additive/cosmetic/internal exclusions, actual deletion-marked tasks versus executing removals, test-only work versus changed admission, negation and quoted/history exclusions. Capture inspectable rationale and semantic assessment; lint is not proof. |
| R02 | Exactly one appropriate declaration; concrete scenario, same-boundary test and detecting assertion; future test paths and specific existing coverage allowed. Multiple risks require mapped coverage. | Positive/negative declaration and structured-boundary cases, missing/duplicate/mixed/empty/placeholder fields and contradictory classification. Semantic fixture review must identify what recurrence each assertion detects. |
| R03 | N/A is factual, specific and justified after considering deterministic/narrower-boundary alternatives; removal does not excuse surviving side effects. | All four permitted categories with factual evidence/residual risk; reject bare race/no-screenshot/hard-to-test claims. Genuine test-only and verification-only work self-satisfies without recursive tests; changed enforcement plus tests requires normal coverage. |
| R04 | Deferral has actual stable host ref, concrete planned case/location/assertion, commitment/ownership and applicable authorization; recheck at publication, execution and delivery. | Trusted resolver cases reflecting the real host lifecycle; reject merely proposed, cancelled, cross-project, scope-lost, stale or inaccessible targets. Do not accept JSON receipts/prose flags. Preserve programmatic supported integration and document authentic CLI limits; no fictional adapter. |
| R05 | Candidate/new-plan/amendment forms round-trip before publication; failed amendments preserve last admitted revision and required reservation/history effects. | Real provision/amend fixture paths, including every declaration form and excluded work. No invalid candidate is marked admitted; no consumed ID is lost/reused. |
| R06 | Explicit validation and bound execution are read-only on sealed plans and reject before workload launch; any preparation helper is explicit draft-only. The legacy wrapper still auto-inserts stubs. | Wrapper/check/runner negative fixtures: absent sentinel, exact seal/sibling bytes, invalid target extension/missing file errors and correct single-file scope. Remove automatic repair wiring without rewriting historical plans. |
| R07 | Before implementation assess current adopted Regression Guard, actual scope/declaration and identifiable admitted revision, with authorization/quiescence owned by Unified. | Agent-first instructions plus actual shared-hook integration only if supported. Fixtures for valid reuse, concrete missing coverage preparation, permitted/denied amendment, native-text/seal mismatch and stale context; generic dispatch machinery remains owned by #46. |
| R08 | Mid-task gap pauses affected work and retains earlier observations/changes; amendments wait for no active/uncertain owning run and do not retroactively certify prior edits/results. | Existing supported amendment/quiescence denial fixtures and documented pause/re-admit/resume/evidence-renewal flow. Do not stop unrelated work or invent cancellation APIs. |
| R09 | Explicit old/new Regression Guard contract mapping; historical renderers/rules preserved, unknown mapping scoped locally. Current strict checking currently lacks an independent RG mapping. | Known old/current/unknown revision and amendment fixtures. Preserve historical bytes, IDs/tombstones/bindings/run history, baseline and actual tier workload hashes; maintenance touches no live registry. |
| R10 | Required guard runs in the task's actual adequate assigned workload through the supported route; adding a guard never silently changes tiers/workloads. | Workload inclusion assessment and truthful missing-coverage cases; existing Unified amendment handles an actually required tier change. Setup checks here are maintenance, never an application task's bound-tier PASS. |
| R11 | Required delivery handoff binds plan/source/adoption revision to actual scenario/case/assertion/layer/tested snapshot/results or substantiated exception; inadequate delivery is unresolved, not covered by lint. | Update original requirement rows with actual evidence; use safe negative fixtures or equivalent reasoned proof. Never reintroduce unsafe behavior into live targets. No tests were run by this Planner. |
| R12 | Separate read-only application review remains optional/not selected; actual cooperative callers and omissions are documented honestly. | Source/instruction tests reject mandatory unselected reviewer prerequisites. Preserve historical reports without treating them as present instructions or approvals; no recursive verifier creation or platform completion claim. |

## Pre-existing failures to ignore
The inspected baseline catalog is valid with zero entries. No tests were executed during planning, so no clean maintenance baseline is claimed. The identified contract gaps are task-owned changes, not ignored failures. Re-read the catalog and actual source at execution; do not demand original receipts or reconstruct unrelated historical archives.

**Flaky-test rule:** A passing retry establishes intermittency, not pre-existing provenance.

## Validation
Owner-directed gate maintenance under the canonical Unified installation/update/repair exception, outside ordinary task admission. Do not allocate live IDs, edit live ledger/binding records, run live tiers or claim a tier PASS. Before and after changes run only the owning gate suites under finite process-tree supervision: timeout --signal=TERM --kill-after=5s 180s node --test --test-reporter=tap --test-timeout=45000 scripts/tests/check-regression-guard.test.mjs scripts/tests/failure-gate.test.mjs. Use one top-level maintenance run at a time, isolated fixture roots and observed owned-child cleanup; report actual commands/results, skipped/timeouts/unobserved checks and remaining blockers honestly.

Inspect canonical/source reference closure, installed/current RG revision mapping, the current Unified pin, actual caller wiring, scoped diff and unchanged live registry/baseline/tier-workload bytes. Fixtures may allocate/amend/run only disposable identities. Do not invoke migration activation, post-merge hooks, product tests, app builds, browser/database/provider services or remote workflows. Future ordinary implementation tasks retain exactly their assigned adequate tier and supported admission/amendment rules.

## Regression Guard
**Covers:** A material change bypasses coverage through titles/exclusions, an invalid or stale current declaration publishes or executes, validation rewrites sealed plans, or updating Regression Guard silently applies current rules to historical contracts or permits amendments under active work.
**Test location:** scripts/tests/check-regression-guard.test.mjs and scripts/tests/failure-gate.test.mjs — scope/declaration, current/history, provision/amend/check/runner and Regression Guard preflight cases.
**What it checks:** For each R01–R12 case, assert the correct admitted/rejected outcome through its owning boundary; negative cases leave workload sentinels absent and seals, prior bindings/history and sibling plans intact. Valid historical/current/exclusion/exception cases remain supported, required review is not invented, and restoring each prior bypass makes its corresponding assertion fail; semantic and delivery obligations require recorded executor evidence beyond lint.

## Relevant files
- `.agents/skills/regression-guard/SKILL.md`
- `.agents/skills/failure-gate-unified/SKILL.md`
- `AGENTS.md`
- `replit.md`
- `scripts/check-regression-guard.mjs`
- `scripts/validate-task-plans.mjs`
- `scripts/new-plan.mjs`
- `scripts/amend-plan.mjs`
- `scripts/run-validation.mjs`
- `scripts/check-failure-gate.mjs`
- `scripts/failure-gate/plans.mjs`
- `scripts/failure-gate/cli.mjs`
- `scripts/failure-gate/store.mjs`
- `scripts/failure-gate/runner.mjs`
- `scripts/failure-gate/merge-guard.mjs`
- `scripts/failure-gate/execution-sources.mjs`
- `scripts/tests/check-regression-guard.test.mjs`
- `scripts/tests/failure-gate.test.mjs`
- `docs/validation/unified-policy.json`
- `docs/validation/unified-tiers.json`
- `docs/validation/unified-task-registry.json`
- `docs/validation/failure-baseline.json`
- `docs/validation/unified-local-execution.md`
- `docs/validation/regression-guard-authoring.md`
- `docs/validation/regression-guard-application-handoff.md`
- `attached_assets/regression-guard-skill_(10.18.2026)_1792369873490.zip`

````
