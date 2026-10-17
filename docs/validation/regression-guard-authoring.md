# Regression Guard: authoring and execution

Authority is `.agents/skills/regression-guard/SKILL.md`, unchanged SHA-256
`fcda16a9910a91e1ace9933651acdf69d252766948bd379ee1bc5ee6a72f2031`.
Failure Gate owns the baseline and Validation sections, tier selection and
bound execution. Regression Guard adds an assertion obligation, not a new tier.

## Before writing a plan

Inspect the real change for bug fix, behavior change, error handling, material
security/privacy, data integrity, concurrency/lifecycle, performance/reliability
and compatibility/contract effects. Announce the canonical classification line
in chat before the first heading. Example:

```text
[REGRESSION-GUARD] Classification: bug-fix, security-privacy. Guard: covered — server/tenant-access.test.ts.
```

This announcement is an agent obligation; the file checker cannot observe chat.
Do not infer materiality solely from a title or mechanical keyword matches.
Scope and semantic review are required even when lint passes.

## Complete new-plan specification

Create a repository-relative JSON input, then use `node scripts/new-plan.mjs
path/to/spec.json`. The example is illustrative, not authorization for an
application workload or a preselected tier:

```json
{
  "title": "Fix cross-tenant record access",
  "what": "Fix authorization that lets one tenant read another tenant's records.",
  "tier": "test-standard",
  "why": "The inspected workload includes the affected server authorization assertions.",
  "coverageEvidence": "docs/validation/unified-tiers.json; name the actual workload and supported invocation after inspection.",
  "done": ["Foreign tenant reads are denied and own-tenant reads still succeed."],
  "outOfScope": ["Provider calls, schema changes and unrelated permissions."],
  "steps": ["Correct the tenant lookup boundary.", "Add the affected route assertion."],
  "regression": {
    "mode": "normal",
    "covers": "A verified tenant A requests the identifier of tenant B's private record.",
    "testLocation": "server/tenant-access.test.ts",
    "checks": "Asserts tenant A receives 403 with no record payload; tenant B receives its own record."
  },
  "baselines": [],
  "relevantFiles": ["server/tenant-access.ts", "server/tenant-access.test.ts"]
}
```

`title`, `what`, `why`, `coverageEvidence` and list entries must be filled,
single-line text, not placeholders. `done`, `outOfScope`, `steps`, `relevantFiles`
are nonempty arrays. Name meaningful scope exclusions, including “None beyond
the stated scope” when appropriate. `nativeTaskRef` is optional linkage, not
permission to rebind historical native work. Baseline declarations retain
their existing ignored/owned semantics; inspect the catalog first.

New plans render What & Why, Done looks like, Out of scope, Steps, baseline,
Validation, Regression Guard (when applicable), Relevant files. Declarations
are generated completely before sealing. No manually edited sealed Markdown.

The `regression` object supports exactly one form:

| mode | Additional fields | Meaning |
| --- | --- | --- |
| `normal` (default) | `covers`, `testLocation`, `checks` | Concrete scenario, test file, specific assertion at the wrong-behavior layer. |
| `na` | `why` | Specific canonical impossibility, rendered as exact N/A and Why N/A declarations. |
| `self` | `deliverable` | Names the test/guard script that is the primary deliverable. |
| `excluded` | `reason` | Records planner exclusion in the sealed spec; no guard heading is emitted. Material work still fails strict lint. |

No mixing variant fields. The exclusion reason is retained in the sealed
spec/registry, not inserted into scope text to force a checker exemption.

N/A reasons are only: a real-timing race that deterministic harnesses cannot
reproduce; unmockable third-party API behavior; purely visual regression with
no screenshot/pixel-diff infrastructure; or complete feature removal. Verify
those facts; mentioning an external API or saying “hard to test” is insufficient.
Existing coverage belongs in normal mode, naming the exact file and assertion.

Self-satisfying is for tests, guard scripts and verification-only work, not
material application changes plus tests. Additive, copy-only, DELETE-prefixed
and non-material internal work is excluded only when the *whole* work qualifies.
A single material part of mixed work still needs its guard.

## Deferral and evidence

The canonical normal form permits:

```text
**Test location:** Deferred to task #123 (accepted) — requires a new deterministic fixture harness.
```

The assertion and scenario must still be concrete. At plan-write time the
planner must independently query available authoritative host task evidence,
verify the exact project/ref and accepted/non-PROPOSED state, and name the
reference. A draft suggestion, task title, local Markdown plan, an “accepted”
string or user-supplied receipt is not proof.

The programmatic `provision` and `amend` entry points accept an optional trusted
`{ resolveTask }` host-code adapter. It must return verified project/ref/state
and an authoritative reference; evidence is captured at each plan write.
Allowed adapter states are ACCEPTED, READY, IN_PROGRESS and COMPLETED; unknown,
draft, cancelled or mismatched targets fail closed. This captures acceptance
at plan-write time, not a promise of the follow-up's eventual completion.
JSON/CLI flags cannot install the resolver. The CLI currently has no authentic
host acceptance adapter, so **CLI deferrals are blocked**; implement the guard
in the current task or obtain an authorized host integration. Fixtures test
the adapter contract, not live host acceptance.

Standalone offline lint checks deferral syntax only, never acceptance.
Historical representations stay byte-stable; current declaration lint is not
proof of historical acceptance or permission to execute.

## Amend, execute and deliver

Use `node scripts/amend-plan.mjs ID TIER "rationale" [replacement-spec.json]`.
Same-tier declaration changes preserve ID, bound workload and baseline roles.
Supply the complete spec when adopting v3 from an older representation.
An invalid replacement leaves the old plan, binding and sibling/archive plans
unchanged. Failed provisioning retains consumed identities as incomplete.

Set `TASK_PLAN_FILE` and `UNIFIED_TASK_ID` to the actual bound context and run
the supported plan validator, then the already-authorized tier. Direct bound
execution also checks declarations before launch. Do not switch tiers just to
add a guard, repair sealed plans in place, or invoke application/provider checks
as gate maintenance.

Before completion, record:

| Scenario | Delivered file/test name | Assertion that catches recurrence | Observed result or valid exception |
| --- | --- | --- | --- |
| Concrete input/boundary | Actual test, not just a plan promise | What fails if the old implementation returns | Authorized check or verifiable N/A/accepted deferral |

Review same-layer coverage: backend route → backend unit/integration assertion;
frontend store → frontend store assertion; cross-layer-only failure → affected
boundary or e2e assertion. A future file need not exist at planning time.
At delivery it must exist and assert the promised behavior, or the documented
exception must be verified. A syntax pass does not prove any of that.

## Enforcement boundary

These are cooperative repository routes, not tamper-proof controls. They do
not intercept arbitrary shell edits, chat publication or Replit platform
completion. They cannot prove test quality, materiality, acceptance status,
same-layer semantics, N/A facts or actual test delivery merely by linting text.
Agent instructions and separate semantic verification cover those obligations.
No live remote CI, browser service, app resource or production operation is
authorized by this gate maintenance.
