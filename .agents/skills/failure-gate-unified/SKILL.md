---
name: failure-gate-unified
description: >-
  Applies an end-to-end validation gate to task planning and execution. Use when
  a project adopts Failure Gate Unified and tasks need transactional IDs,
  one-tier authorization, baseline handling, bounded test runs, evidence-based
  failure classification, and explicit completion states.
---

# Failure Gate Unified

Failure Gate Unified makes test ownership explicit and execution reliable
before work is declared complete. It bridges repositories with legacy failures
and technical debt with disciplined execution: no unmonitored test runs,
unauthorized validation-tier escalation, or silent failures.

Apply it to every task plan and validation execution in a project that adopts
Failure Gate Unified. Govern both phases:

1. **Plan time:** provision a transactional task ID, inspect the baseline
   catalog, establish known failures, and bind one validation tier.
2. **Execution time:** run only the bound tier and classify failures using the
   catalog and available evidence.

If the project's required provisioning, binding, or runner protections are
missing, do not simulate them manually or claim the gate is enforced. Report the
specific gap and mark the task `BLOCKED` until the project owner establishes
the required machinery.

## Non-negotiable contract

### Transactional task IDs

- Mint every task ID through the project's safe provisioning script (for
  example, `scripts/new-plan.mjs`), which must generate the plan and its
  required stubs.
- IDs are permanently unique and never reusable, including after a plan is
  deleted or cancelled.
- Locate and verify the actual provisioning command in the project before
  relying on it. Do not invent a command or manually reuse an ID.

### Single-tier binding and default deny

- Bind each task ID to exactly one registered validation tier:
  `test-fast`, `test-standard`, `test-standard-plus`, or `test-heavy`.
- Select the lightest registered tier that adequately covers the task.
- The runner must reject execution of that task ID under any tier other than
  its registered tier. All other tiers must block the ID.
- If a task genuinely needs a heavier tier mid-flight, amend the plan and its
  binding through the project's supported mechanism, recording the rationale.
  Never bypass the guard or silently change tiers.

### Baseline source and task metadata

- Treat `docs/validation/failure-baseline.json` as the durable source of truth
  for known pre-existing test failures. Match records by exact suite, test, and
  failure signature.
- Every baseline referenced by a plan must be identified as either
  `**Ignored baseline:**` or `**Owned baseline repair:**`.
- `.local/tasks/` is environment-local task archive state. Do not bulk-commit
  it as part of source deliverables.

## Plan-time procedure

Complete these steps before writing the first plan heading:

1. **Provision safely.** Use the verified project provisioning script to mint
   a unique ID and generate the plan file with its required stubs.
2. **Scan the catalog.** Read `docs/validation/failure-baseline.json` and look
   for exact suite, test, and signature matches.
3. **Record the baseline.** Include the following section in every plan,
   including when no failures are known:

   ```markdown
   ## Pre-existing failures to ignore
   None known at plan time. Treat every failure as a potential regression.

   **Flaky-test rule:** A passing retry establishes intermittency, not pre-existing provenance.
   ```

   Replace the default statement with the exact known issues and their required
   `**Ignored baseline:**` or `**Owned baseline repair:**` labels when
   applicable. Do not treat a retry, by itself, as proof that a failure
   predates the task.
4. **Choose one tier.** Select the lightest registered tier that covers the
   task; its ID is bound to this tier.
5. **Validate the plan.** Run the project's local plan validation guards and
   resolve structural or formatting errors before execution.

Every plan must include this section, naming exactly one authorized tier:

```markdown
## Validation
**Command:** `test-standard`
**Why:** <one-line reason this tier covers the task>
**Do not escalate:** This task ID is strictly bound to this tier. Other tiers will block execution.
```

Replace `test-standard` with the chosen registered tier. Keep the rationale
specific to the task.

## Bounded execution

Set the plan path and task ID context for every validation run. For the
project's documented task ID, use:

```sh
export TASK_PLAN_FILE=.local/tasks/<task-id>.md
```

Follow the project's documented invocation for the bound validation tier.
Before running, confirm the runner resolves the task ID to its registered tier.

- **Tier lock:** A command that does not match the ID's bound tier must be
  blocked immediately.
- **Bounded processes:** Use clean timeout bounds. Do not leave orphaned
  daemons, unmanaged child processes, or unmonitored process trees.
- **Single flight:** Do not start duplicate top-level validation runs
  concurrently against the same target.
- **Honest reporting:** A command that was skipped, interrupted, timed out, or
  could not be observed to completion is not a passing check.

## Failure classification and evidence gate

For each test failure, apply these rules in order:

1. **Active ignored baseline:** If the failure exactly matches an active
   catalog record marked as ignored, classify it as pre-existing for this run.
   Skip it; do not investigate or fix it as part of the current task.
2. **Owned baseline repair:** If the plan owns repair of the matching baseline,
   fix it and verify the resolution.
3. **Unlisted failure:** Retry the failing test in isolation. A passing retry
   establishes intermittency only; it does not establish pre-existing
   provenance.
4. **Pragmatic evidence gate:** An unlisted failure may be self-classified as
   pre-existing only when strong contextual evidence supports that conclusion,
   such as relevant files being untouched by the task's diff or a documented
   recent pattern. Record a brief agent note that names the observed evidence.
   Use available project and run evidence; do not require the user to produce
   original receipts.
5. **Insufficient evidence:** Treat any failure that cannot be verified as a
   potential regression. Fix it or obtain clear, attributable confirmation
   before classifying it otherwise.

For every self-classified unlisted failure, emit a classification log:

```text
[SELF-CLASSIFIED PRE-EXISTING] <suite or test> — evidence: <file-diff untouched / known pattern / recent memory>
```

Do not use an isolated pass on retry as the evidence in this log. Preserve the
distinction between an observed fact and an inference.

## Completion and closure

Conclude every task in exactly one of these states:

- **PASS:** All required checks succeed, and any owned repairs are fulfilled.
- **FAIL:** A required product check or owned repair failed.
- **BLOCKED:** Required environment, tools, permissions, or enforcement
  machinery are unavailable.
- **INCOMPLETE:** Work is unfinished or the results are untrustworthy.

Report the state with the validation command and its observed result. Do not
report `PASS` when required checks were skipped, unverified, or failed.

### Owner-directed administrative closure

An authentic owner instruction may direct closure without passing tests—for
example, when the owner changes the task's experimental scope. In that case:

- Set `completionMode: owner_direction`.
- Record the owner's direction and state that this is **administrative
  closure**, not a successful test run.
- Do not represent the task as `PASS` solely because it was administratively
  closed.
- Use an owner direction visible in the active conversation or verifiable in
  the project's task records. Do not ask for original receipts. If the
  direction or authority cannot be verified, do not use this closure mode.

## Baseline maintenance

Maintenance scripts that check for expired or stale ignored-baseline records
surface **warnings**, not hard execution blockers. Keep routine feature work
moving while reporting those warnings for separate maintenance work. A warning
does not make a stale record safe to ignore indefinitely; report the affected
record and its status.
