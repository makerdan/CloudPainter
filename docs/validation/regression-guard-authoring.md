# Regression Guard: current authoring and execution

Authority: `.agents/skills/regression-guard/SKILL.md` and its two `reference/`
files. Current source SHA-256:
`6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1`.
The requirement map, source manifest and maintenance observations are in
`regression-guard-revision-application-handoff.md`. Older application reports are
history, not current instructions or proof of this revision's delivery.

## Adoption, not historical retrofit

`unified-policy.json.regressionGuard.contracts` independently maps the sealed
Unified contract/representation pair to RG rules. Known legacy-v1, unified-v2 and
unified-v3 representations retain the existing legacy checker and byte-identical
renderers. Newly provisioned plans and supported amendments use unified-v4 and
the current RG source/reference fingerprints. Unknown mapping blocks only the
dependent record; it is not grandfathering or an archive reconstruction demand.
No live records or historical plans are migrated by this cutover.

Unified still owns IDs, baseline declarations, approval, binding, lifecycle,
target leases, supervised execution and results. Its subsequent preflight revision
is recorded in `unified-preflight-application-handoff.md`; older RG mappings remain intact.
No new tier or authority exists. Gate maintenance is outside ordinary admission
under authentic owner instruction and does not allocate a live identity.

## Scope assessment before publication

Read actual requested scope, Done, Steps and affected existing behavior. Assess
all eight categories: bug-fix, behavior-change, error-handling, security-privacy,
data-integrity, concurrency-lifecycle, performance-reliability,
compatibility-contract. Every material component needs coverage. Neither DELETE
nor a test/check title exempts an executing change. A task marked for deletion is
non-executing, unlike a change that removes behavior. Negated exclusions,
unrelated examples/history, filenames and incidental risk words prove nothing.

Emit the canonical `[REGRESSION-GUARD] Classification: … Guard: …` announcement
before publication; do not impose an impossible first-input ordering.

Supported inputs remain a complete single-line JSON specification passed to
`node scripts/new-plan.mjs relative-spec.json`, or to
`node scripts/amend-plan.mjs ID TIER "rationale" replacement-spec.json`.
Required fields: title, what, why, tier, coverageEvidence; nonempty arrays done,
outOfScope, steps, relevantFiles; baseline declarations as before.

`regression` has exactly one shape:

| mode | Fields beyond mode |
|---|---|
| normal (default) | covers, testLocation, checks; optional structured deferral |
| na | why |
| self | deliverable (actual file, case and assertion) |
| excluded | reason |

Normal fields are concrete scenario, project-relative test file/case and detecting
assertion. Future files are permitted at planning. Existing tests count without
duplication when the exact case/assertion detects the recurrence. Bare directories,
placeholders, circular promises, duplicate and mixed fields fail admission.
Present declarations are validated even if a title or classification claims exclusion.

Current inputs also require `regressionAssessment`. It is rendered into the
sealed plan, so later mutation fails the seal check; it is not a JSON approval
receipt or proof that the statements are true:

```json
{
  "classification": "material",
  "rationale": "Changing existing admission affects supported execution contracts.",
  "scopeReview": "Reviewed all requested behavior, affected consumers and material components.",
  "coverageReview": "The assertion exercises gate admission and checks denial before child launch.",
  "risks": [{
    "id": "admission",
    "category": "compatibility-contract",
    "change": "An invalid current declaration must not be admitted for bound execution.",
    "layer": "backend gate admission and execution boundary"
  }],
  "coverage": [{
    "risk": "admission",
    "scenario": "An invalid current declaration is offered to bound execution.",
    "testLocation": "scripts/tests/failure-gate.test.mjs",
    "assertion": "Assert refusal before the workload sentinel exists and preserve the sealed plan.",
    "layer": "backend gate admission and execution boundary"
  }]
}
```

Each risk has a unique local label, valid category, concrete change and layer.
Normal coverage maps every risk exactly once to scenario, testLocation, assertion,
and matching layer. The normal declaration must contain these mapped values.
Several risks may share a real case/file, but each recurrence must be accounted
for. The planner/executor reviews semantics: a matching layer string or long
assertion alone does not prove the correct boundary or a detecting assertion.

For excluded/self work, classification is `excluded`/`self`, risks and coverage
are empty, with the same three concrete review/rationale fields. Exclusion names
one of additive, cosmetic, internal, deletion-marked, test-only. These are
whole-scope factual dispositions. Self-satisfaction requires the entire change
to be the test/check or verification of unchanged behavior; production or
material guard-admission changes plus tests use normal coverage.

N/A uses material risks, empty coverage, and `exception` with category
real-timing/external/visual/removed, all risk labels in `risks`, and concrete
facts, alternatives, residualRisk. Inspect actual deterministic scheduling,
mocking, narrower boundaries and visual capabilities. Removal must leave no
surviving material side effects unguarded. Keyword claims and missing fixtures
are not evidence; the executor must substantiate these facts in the handoff.
Use a normal guard for surviving material effects; do not hide them behind N/A.

## Deferral: authentic resolver only

Normal declaration fields retain actual planned case/file/assertion and name
the stable host follow-up. `regression.deferral` records ref, owner, reason and
disposition. No numeric reference or universal lifecycle status is required.
The trusted programmatic `{resolveTask}` adapter to provision/amend/checkPlan,
regressionPreflight and run (sixth argument after retry context) resolves fresh
host evidence, not user-authored JSON:

- verified, committed and eligible are true under the host's real lifecycle;
- projectId/taskRef/owner match; authoritative reference and revision exist;
- concrete commitment/authorization cover the deferral;
- recurrences includes each exact mapped scenario.

Publication captures that evidence. Execution/preflight/delivery re-resolve it;
loss of scope, commitment or eligibility, inaccessible evidence, changed
revision or missing resolver fails closed. Changed evidence needs a supported
amendment. At delivery call read-only checkPlan with the real resolver again
and record deferred, not delivered. The CLI has no authentic host resolver:
**CLI deferrals remain unavailable**, not simulated by receipt flags.
Historical deferrals retain their recorded older contract.

## Pre-implementation, workload and amendments

Follow the Agent-first procedure in AGENTS.md before any implementation and after
each affected mid-task gap. `check-regression-preflight.mjs ID OBSERVED_PLAN_HASH`
with TASK_PLAN_FILE checks current local admission, scope-assessment consistency,
owning-run quiescence and explicit test-file inclusion. Reuse a valid declaration;
prepare concrete missing coverage and use supported amendments only under actual
scope authorization. Recheck the current revision immediately before resumption.
Native text changes do not update the local seal or binding.

The local workload check recognizes explicit Node script/test files in bound
steps at their actual cwd; it does not infer coverage from a tier name or opaque
package alias. Missing/opaque inclusion requires owning integration/resolution,
not new tiers, arbitrary checks, silent escalation or a false PASS. Deferral and
N/A do not waive other assigned-tier checks. Test presence is not execution;
delivery still needs the actual assertion and observed result.

Invalid candidates never publish as admitted; post-reservation failures retain
the consumed identity as incomplete. Invalid amendments preserve the last
admitted revision, binding and history. Active/uncertain owning runs or retained
target leases block amendment. Preserve earlier edits/observations, renew
affected evidence and never claim retrospective authorization.

## Actual enforcement and limits

Provision, amend, checkPlan, explicit wrapper validation, selected sealed-plan
checker and bound run/validation-tier share the applicable decision.
Validation never repairs plans. `--fix-stub` is disabled for all targets because
there is no authentic native-draft discriminator. No draft helper is installed.
The wrapper returns after the revision-aware bound check; it does not apply the
newest offline linter to old seals. Unsealed offline text lint is advisory, not
admission, authorization, semantic proof or deferral verification.

The helper is a cooperative RG component, not the generic Unified pre-dispatch
system or a Replit Start hook. Agent host-scope/lifecycle/authorization assessment,
native-text reconciliation, preparation, amendment selection and immediate
revision recheck remain required. Arbitrary edits, direct unguarded commands,
chat publication and platform completion cannot be intercepted here.

## Delivery

Use the canonical delivery-handoff template. Bind the requirement map to
approved scope, native plan and admitted revision, canonical source/adoption,
tested implementation/workload/target and actual observations. For each risk
record triggering input → actual file/case → detecting assertion at the right
layer → observed execution or substantiated exception/deferral, residual gaps,
and a safe negative control or equivalent detecting evidence.
Do not equate valid plans, named files, syntax PASS or source-package tests with
delivered behavior. Inadequate delivery remains unresolved.

Separate read-only application review is **not selected**. It is optional unless
the owner selects it or an identifiable approved requirement mandates it.
No automatic reviewer, extra approval registry or review blocker is introduced.
