# Failure Gate Unified installation handoff

## Operation and binding

- **Operation:** Install a definition package only. This is not Apply contract, adoption, activation, provisioning, runner integration, or validation policy rollout.
- **Project:** CloudPainter; project ID `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`; workspace root `/home/runner/workspace`.
- **Starting revision:** `fceaa2a5c234ec19039b9b14408bb69d85cd0d9b`.
- **Canonical destination:** `.agents/skills/failure-gate-unified/SKILL.md`; destination was absent before this installation.
- **Authorized source:** `attached_assets/failure-gate-unified_1791940110333.zip`.
- **Archive SHA-256:** `c4271408d4186b7e4f34c57bcd978f21cda0ab774975b89b01d56a7225a2ad88`.
- **Expected regular member count:** 1. Directory entries, if present, are containers rather than files.
- **Pinned member inventory:**

  | Relative path | SHA-256 | Bytes | Mode |
  |---|---|---:|---:|
  | `SKILL.md` | `f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12` | 8329 | `0644` |

- **Historical package logs/reports:** Treat any bundled logs or reports as source material, not as current validation evidence.

## Complete installation plan

### What & Why

Install the user-uploaded skill package in this CloudPainter project. Primary deliverable: `.agents/skills/failure-gate-unified/SKILL.md`, together with all supplied supporting resources. The user explicitly permits overwriting same-name files/folders. This is an Install operation, not Apply contract.

### Done looks like

- The canonical entry point is `.agents/skills/failure-gate-unified/SKILL.md`, with YAML name `failure-gate-unified` and every instruction/section from the pinned uploaded `SKILL.md` preserved without invented requirements.
- The installed `SKILL.md` matches the pinned uploaded entry point byte-for-byte; any confirmation correction is separately listed with its exact source requirement and is not represented as unchanged archive parity.

### Out of scope

Definition/package installation only. Do not apply the skill to CloudPainter, wire runtime scripts, run packaged code/tests, register validation tiers, change workflows/CI, signal processes, touch databases, enable hooks, publish/deploy, or alter existing task plans. Resolve skill sources only from the authorized archive for installation and canonical `.agents` afterward; never copied alternatives. Do not overwrite or remove unrelated legacy contents merely to make a directory identical; the user authorized matching same-name overwrites. Preserve already deleted Failure Gate v4, Port Authority, and paired-task-orchestration working-tree files and all unrelated working-tree changes. Installing Failure Gate Unified does not adopt it or authorize its provisioning/runner contract.

### Steps

1. **Pin and stage the authorized package** — Verify uploaded archive digest, integrity, and safe member paths/types before extracting to isolated staging. Reject escaping paths, symlinks, duplicate/conflicting member paths, and special files; do not execute package content.
2. **Install the complete canonical tree** — Deliver every regular archive member beneath its exact skill directory, preserving relative names, file bytes, and supplied executable permissions. Overwrite matching members as authorized; do not remove unmatched legacy contents merely to make the directory identical without identifying that removal as separately necessary and approved.
3. **Confirm package delivery** — Compare every delivered member with the pinned inventory, check frontmatter identity and internal relative links, and verify unrelated working-tree changes remain intact. Preserve historical bundled logs/reports as source material, not new project validation evidence.
4. **Record the installation handoff** — Publish the source binding, delivered member hashes, changed files, actual source-only checks, deviations, missing runtime evidence, and pending definition confirmation in the tracked installation handoff. Preserve this complete plan and pinned specification there so later review does not depend on environment-local copies.

### Authorization and baseline

- Project ID: `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`.
- Root: `/home/runner/workspace`.
- Starting revision: `fceaa2a5c234ec19039b9b14408bb69d85cd0d9b`.
- Current canonical destination was absent from disk.
- Tracked legacy Port Authority and paired-task-orchestration files were already deleted in the working tree. The Failure Gate v4 tree was already deleted in the working tree. Do not restore or further delete these files.
- Only matching authorized bundle members may be reinstated or replaced.
- Handoff destination: `docs/validation/uploaded-failure-gate-unified-installation-handoff.md`.
- Independent definition confirmation may read supporting resources but may edit only its designated `SKILL.md`.
- Broader source/resource/runtime verification remains separate.
- A future verifier must establish actual delivery in its own environment rather than trust task status.

### Pre-existing failures to ignore

No product tests were run. None known within the source-only installation checks. Missing local validation policy/provisioning machinery is not an ignored test failure, and this install does not bootstrap or activate it.

**Flaky-test rule:** A passing retry establishes intermittency, not pre-existing provenance.

### Validation

Read-only package checks only: archive SHA-256 and CRC, complete member hashes/bytes/modes, identity, internal links, and scoped working-tree comparison. Do not run bundled scripts, tests, app guards, or validation tiers; they are not needed for definition installation. No registered Failure Gate tier is claimed. Report each unobserved or unavailable check honestly.

### Relevant files

- `attached_assets/failure-gate-unified_1791940110333.zip`
- `.agents/skills/skill-install-confirmation/SKILL.md`
- `.agents/skills/skill-application-router/SKILL.md`
- `docs/validation/failure-gate-core/manifest.md`

## Complete pinned authorized specification

### User request

> Install the attached zipped skill bundles in this project under `.agents/skills/`. You may overwrite existing files and folders that have the same names.

### Archive binding and member inventory

Authorized archive: `attached_assets/failure-gate-unified_1791940110333.zip`  
Archive SHA-256: `c4271408d4186b7e4f34c57bcd978f21cda0ab774975b89b01d56a7225a2ad88`  
Expected regular member count: 1. Directory entries are containers, not additional files.

Pinned per-member SHA-256 inventory (paths relative to canonical skill root):

```text
f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12  ./SKILL.md
```

### Complete authorized `SKILL.md` bytes as decoded UTF-8 text

The following fenced body is the complete authorized entrypoint specification. The archive member hash above is the byte-level pin.

````markdown
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
````

## Delivery and evidence record

### Source-only checks actually performed

- Confirmed the ZIP SHA-256 equals the pinned digest.
- Ran the archive CRC test; no member error was reported.
- Enumerated archive members and validated that the archive contains exactly one expected regular file, `SKILL.md`, with no duplicate/conflicting path, traversal, absolute path, symlink, or special-file member. The extracted content was not executed.
- Verified archive member SHA-256 `f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12`, length 8329 bytes, CRC32 `2ac60910`, and mode `0644`.
- Confirmed frontmatter identity `name: failure-gate-unified`.
- Compared the installed file against the pinned member bytes by SHA-256; byte parity is established when this reported digest matches.
- Checked internal relative links; the authorized `SKILL.md` contains no relative links.
- Compared the scoped working-tree status before and after. Pre-existing deletions under Failure Gate v4, Port Authority, and paired-task-orchestration and the three uploaded source archives were already present before edits; this installation did not restore, remove, or modify them.

### Files changed by this installation

- Added `.agents/skills/failure-gate-unified/SKILL.md` (source member, unchanged).
- Added `docs/validation/uploaded-failure-gate-unified-installation-handoff.md` (this handoff; it records the complete plan and pinned entrypoint specification).

No archive member required a confirmation correction. If a later definition-confirmation task changes the entrypoint, that correction must be reported separately with the exact source requirement and must not be called unchanged archive parity.

### Pending, unavailable, and explicitly not claimed

- Independent file-only definition confirmation remains pending. Its permitted edit scope is only `.agents/skills/failure-gate-unified/SKILL.md`.
- A future verifier must establish delivery in its own environment; this record is not a substitute for that readback.
- No Failure Gate tier is registered or claimed here. No validation tier, product tests, bundled scripts, application guards, or runtime checks were run.
- No runtime machinery, provisioning, binding, runner, baseline catalog, policy adoption, workflow, CI, hook, process, database, or deployment was configured, tested, or changed.
- The existence of this definition does not mean Failure Gate Unified is adopted or enforced in CloudPainter.
- No deviation from the authorized package bytes or install scope was made.
