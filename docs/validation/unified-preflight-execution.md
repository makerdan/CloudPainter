# Unified pre-implementation execution

The current canonical revision is
`2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`.
The policy's `preflightContracts` applies expected-context enforcement to this
revision, not earlier sealed records. The existing four workloads and budgets
are unchanged. This document supplements the current canonical contract, not
historical reports. Gate-only maintenance uses its owner-directed exception.
The tier file's `coverage` string retains historical staging wording because
that file is hashed as a whole into old bindings. It is not a current staging
restriction: the effective policy is ACTIVE. No workload-file bytes are changed
just to update this label or force historical amendments.

## 1. First action after Start: inspect, do not implement

Read AGENTS.md, the canonical contract, policy, actual task and complete sealed
inputs. The executing Agent uses the verified host tools `getProjectTask` and,
when needed, `updateProjectTask`. Those are Agent tools, **not Node imports or
shell-accessible APIs**. No host Start hook or CLI approval adapter is installed.

Retrieve the full actual task, not a title/search snippet. Check:

- It is the same project/task as the sealed native linkage, with eligible
  current lifecycle and no cancellation, supersession or administrative closure.
- The actual approved scope and governing revision cover the proposed work.
  Inspect owner instructions/task records under the real policy. Start and
  plan validity are not approval; do not fabricate an approval flag or receipt.
- The complete authoritative seal agrees with the native dispatch payload,
  plan hash, ID, tier and contract. A mutable title/description is not a seal.
- The baseline catalog is readable/valid; exact applicable entries have
  ignored/owned declarations and the flaky rule is present.
- Actual workload coverage is adequate and the lightest adequate tier is used.
  Names do not establish coverage. Current RG scope/risk/assertion mapping must
  cover every material boundary and the guard file must be in that workload.

Do this automatically. Do not ask for new permission for unchanged covered
work. Ask only for a genuinely uncovered change; record the exact decision.
No app edits, migrations, provider calls or workloads may precede admission.

## 2. Prepare gaps separately; reuse an adequate plan

The Agent inspects source and actual workload definitions and prepares concrete
scope, tests, scenarios/assertions and baseline ownership. It does not invent
coverage from a title or generate generic “tests the fix” stubs.

`node scripts/prepare-plan.mjs candidate-and-inspection.json` reads:

- `draft`: current complete or incomplete specification;
- `inspection`: concrete missing specification fields and `requiredSteps`
  containing the inspected code-owned workload step names;
- optionally `id` for an existing sealed plan, with the observed context below.

Preparation validates fields and RG mapping, selects the first registered tier
containing every required step, and prints a candidate. It never provisions,
writes a seal, grants approval, delivers tests or launches work. An unavailable
adequate tier remains selected and blocked, never replaced with a weaker one.
Coverage meaning remains Agent-inspected; the helper is not a natural-language
scope or approval engine.

`reuse` means no amendment. `provision-required` uses `new-plan.mjs` normally.
`amendment-required` uses the amendment route below. Missing evidence is an
actionable refusal, not a placeholder or an implementation-ready plan.

## 3. Native/sealed payload and read-only local preflight

Once provisioned, deliver the exact sealed plan bytes in the native description's
explicit Unified dispatch payload. Preserve the approved original scope text.
The payload is a JSON object with **only** these string fields:

`id`, `planHash`, `tier`, `contract`, `nativeTaskRef`, `nativeSealedText`.

`nativeSealedText` is the full exact plan, JSON-escaped without newline/Unicode
normalization. `sealedInputs(root,id)` can export the local expected bytes, but
that export is **not host observation or approval**. Use `updateProjectTask` to
persist a supported new/revised payload, then `getProjectTask` to read the entire
authoritative description back. Compare actual scope and exact payload. Do not
merely write a local task archive file. Record mismatches and reconcile before
dispatch. The host write and local seal are not an atomic cross-system transaction:
a partial write blocks until supported readback/reconciliation succeeds.

Save the observed native payload to a repository-relative local context file.
It contains no secrets and no approval boolean. Set:

```sh
export UNIFIED_TASK_ID=FGU-<the-provisioned-id>
export TASK_PLAN_FILE=.local/tasks/FGU-<the-provisioned-id>.md
export UNIFIED_CONTEXT_FILE=.local/tasks/observed-native-context.json
node scripts/check-unified-preflight.mjs "$UNIFIED_TASK_ID"
```

These are syntax examples, not IDs to copy. The checker is read-only: no leases,
registry writes, stubs, plan edits or workloads. It checks exact supplied task
context, local eligibility, canonical pin, historical mapping, seal/tier/workload,
baseline and RG declarations/inclusion; active/uncertain work or retained target
leases refuse. Missing capabilities are reported as execution BLOCKED.
Output explicitly says `LOCAL_PLAN_VALID_HOST_CHECKS_REQUIRED`,
`hostAuthorization: NOT_OBSERVED`, `hostLifecycle: NOT_OBSERVED`.
It cannot authenticate a caller-supplied payload or judge meaningful coverage.
The Agent's host inspection in section 1 is independently required.

## 4. Dispatch and validation

Immediately before each affected edit batch/resumption or workload dispatch,
repeat current host scope/authorization/lifecycle and expected-context checks.
If using direct Agent editing tools, this is cooperative instruction, **not an
atomic editor lock**. Recheck after any coordination gap.

The supported local command boundary is:

```sh
node scripts/dispatch-implementation.mjs "$UNIFIED_TASK_ID" bounded-command.json
```

The command file names an inspected repository-relative `.mjs` implementation
script, string `args`, `timeoutMs` (1–180000), `cleanupMs` (1–10000).
This deliberately limited route does not pass credentials or invoke a tier.
It checks expected context again under the affected target lease and supervises
the complete owned process tree. Raw logs and command reports go under
`.local/failure-gate/implementation/`. Uncertain completion retains exclusion.
Programmatic `dispatch` uses the same revision/lease boundary; its awaited
callback must encompass all affected work and no detached children. Exceptions
after starting work retain the lease because quiescence is unknown.

This route enforces local context, not host approval or all possible file edits.
Do not use it to bypass a tier, make paid calls, run migrations without authority
or claim an implementation-command PASS is validation evidence.

`validate-task-plans.mjs`, `check-failure-gate.mjs ID`, the RG component, all four
tier wrappers, `run-validation.mjs`, retry and classification forward the observed
context for new contracts. Run **only** the complete bound tier. Retries retain
their original provenance and never replace full workload evidence.

## 5. Amendments and mid-task gaps

Pause **affected** implementation and validation; preserve edits/observations.
Do not stop unrelated targets. Wait for observed quiescence. Existing target
leases exclude supported implementation dispatch and validation from amendments.
Active/uncertain runs or retained locks block; do not delete locks by age,
invent cancellation or assume an absent PID proves the work finished.

The current route is:

```sh
node scripts/amend-plan.mjs "$UNIFIED_TASK_ID" BOUND_TIER \
  "concrete amendment rationale" replacement-spec.json coordination.json
```

For the current contract, expected observed context is mandatory. Coordination
has two concrete text fields: `authorizationApplicability` and `evidenceImpact`.
Record the actual direction/reference and why it covers the candidate, or the
genuinely uncovered decision; record already-made changes, observations and
which affected evidence must be renewed. These notes are audit information,
**not machine-verified approval or a substitute for actual host inspection**.
Do not execute an uncovered candidate.

The amendment rechecks source revision/status under transaction, holds old/new
target leases, guards the candidate before invalidating the old seal, preserves
identity/history and records old/new tier/definition/contract/coverage. Native
identity cannot be substituted. Concurrent stale amendments reject; interrupted
publication blocks rather than silently executing partial state.

Reconcile the native payload through the host write/readback route in section 3,
repeat admission, reassess prior edits and renew affected checks. An amendment
never retroactively authorizes edits or certifies old results. Valid unchanged
work does not require a fresh owner click or gratuitous revision.

## 6. Delivery, restart and unsupported routes

Ignored `.local/tasks` plans do not automatically reach another task checkout.
Deliver exact sealed bytes via the authoritative native payload or a tracked
delivery file; verify SHA and authoritative existing binding before writing a
missing local plan with exclusive creation. Never overwrite a changed file.
If registry history is missing, use the existing merge/preservation route,
retaining every independently consumed ID/tombstone/binding/run. Never reset,
reallocate, manually retrofit native IDs or copy an old ledger over a newer one.

Closed/cancelled/superseded host tasks remain cooperatively denied; local
cancelled/owner-closed IDs are machine-denied. No historical reopening or
revalidation adapter is installed. Unknown contract/amendment mappings need
their exact supported prerequisite or owner-directed gate repair.

Record completion as PASS/FAIL/BLOCKED/INCOMPLETE with command, observed result,
plan/workload/implementation snapshots and actual gaps. Runner reports preserve
raw failures and isolated-retry distinctions. Relevant source/target/configuration
changes require affected-evidence renewal; no arbitrary universal expiry.

Disposable fresh-process/copy fixtures are not a live restart or another Agent's
execution. Current capabilities are empty: higher database/browser routes fail
closed. No remote CI, native scheduler interception, deployment, machine-bound
authority or automatic progression is installed or implied.
