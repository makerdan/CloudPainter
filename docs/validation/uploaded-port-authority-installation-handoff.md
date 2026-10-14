# Port Authority Bundle Installation Handoff

**Result:** Package delivery complete; independent definition confirmation pending. This record reports source/package installation only. It does not claim runtime activation, adoption, implementation, acceptance, or validation-tier registration.

## Source binding

- Project ID: `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`
- Workspace root: `/home/runner/workspace`
- Starting revision: `fceaa2a5c234ec19039b9b14408bb69d85cd0d9b`
- Authorized source: `attached_assets/Port_Authority_Core_(10.11.2026)_1791940125678.zip`
- Pinned archive SHA-256: `8382fe8ed8887bcfdd891a858be9b60973afab423d48a1445cc804d279e21e87` (matched)
- Destination: `.agents/skills/port-authority/`
- Expected/delivered regular members: 17 / 17
- Source authority: the pinned authorized archive for this installation; canonical `.agents` destination after installation. No historical source copy or runtime mirror was substituted.

## Delivery and changes

All 17 regular archive members were copied from isolated temporary staging into their matching canonical paths. Archive executable permission bits were preserved. No archive code, tests, or scripts were run. No unmatched existing file was removed during this operation. Two historical directories that were already deleted in the starting working tree were not restored: `.agents/skills/port-authority/bundle/` and related prior package content.

The entry point `.agents/skills/port-authority/SKILL.md` is byte-for-byte identical to the pinned archive member (SHA-256 `d208f7b8f0aa9c3e2d681b9ce4b3ccda7f4259a2a67014b69ce9dddd26c5533f`). Its frontmatter identity check found `name: port-authority`. No confirmation correction has been made; there is no correction to represent as archive parity.

### Delivered member inventory

- `.agents/skills/port-authority/AUTHORING-SPECIFICATION.md` — SHA-256 `ce049c85c71699f1daed35214a6523149ac3b0ea9b7c669d8ceb4d908bd873ea`; mode `0644`
- `.agents/skills/port-authority/README.md` — SHA-256 `0249ab72a81aa581592a8df8945857c751c219101e85f8f7188d3ad991cebb7c`; mode `0644`
- `.agents/skills/port-authority/SKILL.md` — SHA-256 `d208f7b8f0aa9c3e2d681b9ce4b3ccda7f4259a2a67014b69ce9dddd26c5533f`; mode `0644`
- `.agents/skills/port-authority/SOURCE-MANIFEST.json` — SHA-256 `48eff37d17caab7f3414c95e8abd36059e8d1b7c850ebf44588e821e5fa45ba8`; mode `0644`
- `.agents/skills/port-authority/VERIFICATION-REPORT.md` — SHA-256 `d5206fcd539d0aecd9cf6f303ecce3b622c6708d51989cc8b0b677e83bb9de3f`; mode `0644`
- `.agents/skills/port-authority/reference/advanced-controls.md` — SHA-256 `41ff3c12c3e82d476d885464d1cf7f8654b9f169d1a3a0d68d66dd55ecfb09cb`; mode `0644`
- `.agents/skills/port-authority/reference/runtime-contract.md` — SHA-256 `1fa56e8ec713427b5f9bd3d80f4dc8b07d61120ade9bbb41b441ba708aaa8e73`; mode `0644`
- `.agents/skills/port-authority/reference/symptom-guidance.md` — SHA-256 `5d5479363dd0c04c53fbc4b7b48e2c8df4e7548863cc32f531c89d2966d4d322`; mode `0644`
- `.agents/skills/port-authority/scripts/free-ports.mjs` — SHA-256 `a1afa0b0234beb83de9eeaabf091166ca1d248c09b17656275291abc3167dcae`; mode `0755`
- `.agents/skills/port-authority/scripts/host-capabilities.mjs` — SHA-256 `cde66e139ecbb541f168edf34adbf6583369fd14e6c0590b9f67716fc0514061`; mode `0644`
- `.agents/skills/port-authority/scripts/runtime-environment.mjs` — SHA-256 `530e8a18d6dbd50ef764ee4b276319f0cfa4307e1c6889f43f1686af95bae9b6`; mode `0644`
- `.agents/skills/port-authority/scripts/validation-lock.mjs` — SHA-256 `7d1ac732db42a85bfc6c5a747e24fa293dd398ed9ca4499cd549a751e99bdfe2`; mode `0755`
- `.agents/skills/port-authority/tests/core.test.mjs` — SHA-256 `99e7d6f1bc41e5955c6c8bc128bc78eaf193a05f1dc8962d3f88ddf1246504ff`; mode `0644`
- `.agents/skills/port-authority/tests/hardening.test.mjs` — SHA-256 `ce698d36a7b93256bc9cb235e337ea7ad3d58f901a2d664b85deb22c34b56bdf`; mode `0644`
- `.agents/skills/port-authority/usage-prompt.txt` — SHA-256 `420413af7dbb79f734cd72c5c66e1c36d1ac9b691750fa4eacdb417d0416c890`; mode `0644`
- `.agents/skills/port-authority/validation/run-1.log` — SHA-256 `3d97592499605199f19aabda4a5749fe0cf4182faae00cbd38a63ef250d8dece`; mode `0644`
- `.agents/skills/port-authority/validation/run-2.log` — SHA-256 `a2bb0b54af5f4d94d8f44c0556b75555d6e59d0699ee9a693d88b910374c5568`; mode `0644`

## Source-only checks performed

- Recomputed archive SHA-256 and matched the pinned digest above.
- ZIP CRC integrity check passed (`testzip()` returned no failing member).
- Validated all archive member paths before staging: no absolute/traversal paths, backslash/NUL path characters, duplicate/conflicting paths, symlinks, or special files. Directory entries were treated as containers; the exact pinned 17-file inventory matched.
- Verified every archive member SHA-256 before staging, then verified staged and delivered bytes, hashes, and modes. The two executable members retain mode `0755`; other delivered regular files retain `0644`.
- Checked the `port-authority` frontmatter identity and resolved all three local relative Markdown links within the package.
- Compared working-tree status with the pre-install baseline. The only new project files from this task are the 17 delivered package members and this handoff. Pre-existing unrelated deletions and uploaded archives remain unchanged (listed below).

## Changed files from this task

- The 17 files listed above under `.agents/skills/port-authority/`.
- `docs/validation/uploaded-port-authority-installation-handoff.md` (this record, including the complete task plan and pinned specification below).

## Pre-existing working-tree changes preserved

- The already-deleted `.agents/skills/failure-gate-v4/` tree remains deleted and was not restored or further modified.
- The already-deleted `.agents/skills/paired-task-orchestration/` files remain deleted and were not restored or further modified.
- The pre-existing deletions under `.agents/skills/port-authority/bundle/` remain unchanged; no old unmatched contents were added back.
- The three uploaded archive files remain untracked and unchanged: `attached_assets/Paired_Task_Orchestration_(10.11.2026)_1791940136228.zip`, `attached_assets/Port_Authority_Core_(10.11.2026)_1791940125678.zip`, and `attached_assets/failure-gate-unified_1791940110333.zip`.

## Scope limits, deviations, and pending evidence

- No product tests, bundled tests/scripts, app guards, validation tiers, workflows, CI, processes, databases, hooks, runtime callers, or deployment paths were exercised or changed.
- Historical bundle validation logs and reports were delivered as source material only; they are not new project validation evidence.
- No registered Failure Gate tier is claimed. No runtime ownership, port availability, health, conflict resolution, activation, or independent host acceptance evidence was collected.
- No deviation from the authorized package inventory or SKILL.md specification. The plan's protected unrelated working-tree state was preserved.
- Independent definition confirmation is pending and may edit only the designated `.agents/skills/port-authority/SKILL.md`. Broader package/source/resource/runtime verification remains separate. A future verifier must establish delivery in its own environment and must not rely on task status or the temporary staging path.

## Complete plan and pinned specification

The following is the complete assigned task plan, copied verbatim from `.local/tasks/task-7.md` as the durable record of the pinned specification and all constraints.

# Task #7: Install port-authority bundle

# Install port-authority bundle

## What & Why
Install the user-uploaded skill package in this CloudPainter project. Primary deliverable: `.agents/skills/port-authority/SKILL.md`, together with all supplied supporting resources. The user explicitly permits overwriting same-name files/folders. This is an Install operation, not Apply contract.

## Done looks like
- The canonical entry point is .agents/skills/port-authority/SKILL.md, with YAML name port-authority and every instruction/section from the pinned uploaded SKILL.md preserved without invented requirements.
- The installed SKILL.md matches the pinned uploaded entry point byte-for-byte; any confirmation correction is separately listed with its exact source requirement and is not represented as unchanged archive parity.

## Out of scope
Definition/package installation only. Do not apply the skill to CloudPainter, wire runtime scripts, run packaged code/tests, register validation tiers, change workflows/CI, signal processes, touch databases, enable hooks, publish/deploy, or alter existing task plans. Do not edit runtime mirrors or install unrelated companions. Preserve the already deleted failure-gate-v4 tree and all unrelated working-tree changes; this request does not authorize restoring or further deleting them. Installing Failure Gate Unified does not adopt it or authorize its provisioning/runner contract. Resolve skill sources only from the authorized archive for installation and canonical .agents afterward; never copied alternatives.

## Steps
1. **Pin and stage the authorized package** — Verify the uploaded archive digest, integrity and safe member paths/types before extracting to isolated staging. Reject escaping paths, symlinks, duplicate/conflicting member paths and special files; do not execute package content.
2. **Install the complete canonical tree** — Deliver every regular archive member beneath its exact skill directory, preserving relative names, file bytes and supplied executable permissions. Overwrite matching members as authorized; do not remove unmatched legacy contents merely to make the directory identical without identifying that removal as separately necessary and approved.
3. **Confirm package delivery** — Compare every delivered member with the pinned inventory, check frontmatter identity and internal relative links, and verify unrelated working-tree changes remain intact. Preserve historical bundled logs/reports as source material, not new project validation evidence.
4. **Record the installation handoff** — Publish the source binding, delivered member hashes, changed files, actual source-only checks, deviations, missing runtime evidence and pending definition confirmation in the tracked installation handoff. Preserve this complete plan and pinned specification there so later review does not depend on environment-local copies.

## Authorization and baseline
Project ID: `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`; root: `/home/runner/workspace`; starting revision: `fceaa2a5c234ec19039b9b14408bb69d85cd0d9b`. Native task descriptions are host planning records, not Failure Gate authorization IDs. Current canonical destination is absent from disk; tracked legacy port-authority and paired-task-orchestration files are already deleted in the working tree. Only matching authorized bundle members may be reinstated/replaced.

Handoff destination: `docs/validation/uploaded-port-authority-installation-handoff.md`. Independent definition confirmation may read supporting resources but may edit only its designated SKILL.md. Broader source/resource/runtime verification remains separate. A future verifier must establish actual delivery in its own environment rather than trust task status.

## Pre-existing failures to ignore
No product tests were run. None known within the source-only installation checks. Missing local validation policy/provisioning machinery is not an ignored test failure, and this install does not bootstrap or activate it.

**Flaky-test rule:** A passing retry establishes intermittency, not pre-existing provenance.

## Validation
Read-only package checks only: archive SHA-256 and CRC, complete member hashes/bytes/modes, identity, internal links and scoped working-tree comparison. Do not run bundled scripts, tests, app guards or validation tiers; they are not needed for definition installation. No registered Failure Gate tier is claimed. Report each unobserved or unavailable check honestly.

## Relevant files
- `attached_assets/Port_Authority_Core_(10.11.2026)_1791940125678.zip`
- `.agents/skills/skill-install-confirmation/SKILL.md`
- `.agents/skills/skill-application-router/SKILL.md`
- `docs/validation/failure-gate-core/manifest.md`

## Complete authoritative specification
User request: "Install the attached zipped skill bundles in this project under .agents/skills/ . You may overwrite existing files and folders that have the same names."

Authorized archive: `attached_assets/Port_Authority_Core_(10.11.2026)_1791940125678.zip`
Archive SHA-256: `8382fe8ed8887bcfdd891a858be9b60973afab423d48a1445cc804d279e21e87`
Expected regular member count: 17. Directory entries are containers, not additional files. The archive is the complete authoritative resource specification; all its members must be delivered. Do not substitute historical originalSourceFiles for delivered package bytes.

Pinned per-member SHA-256 inventory (paths relative to canonical skill root):
```text
ce049c85c71699f1daed35214a6523149ac3b0ea9b7c669d8ceb4d908bd873ea  ./AUTHORING-SPECIFICATION.md
0249ab72a81aa581592a8df8945857c751c219101e85f8f7188d3ad991cebb7c  ./README.md
41ff3c12c3e82d476d885464d1cf7f8654b9f169d1a3a0d68d66dd55ecfb09cb  ./reference/advanced-controls.md
1fa56e8ec713427b5f9bd3d80f4dc8b07d61120ade9bbb41b441ba708aaa8e73  ./reference/runtime-contract.md
5d5479363dd0c04c53fbc4b7b48e2c8df4e7548863cc32f531c89d2966d4d322  ./reference/symptom-guidance.md
a1afa0b0234beb83de9eeaabf091166ca1d248c09b17656275291abc3167dcae  ./scripts/free-ports.mjs
cde66e139ecbb541f168edf34adbf6583369fd14e6c0590b9f67716fc0514061  ./scripts/host-capabilities.mjs
530e8a18d6dbd50ef764ee4b276319f0cfa4307e1c6889f43f1686af95bae9b6  ./scripts/runtime-environment.mjs
7d1ac732db42a85bfc6c5a747e24fa293dd398ed9ca4499cd549a751e99bdfe2  ./scripts/validation-lock.mjs
d208f7b8f0aa9c3e2d681b9ce4b3ccda7f4259a2a67014b69ce9dddd26c5533f  ./SKILL.md
48eff37d17caab7f3414c95e8abd36059e8d1b7c850ebf44588e821e5fa45ba8  ./SOURCE-MANIFEST.json
99e7d6f1bc41e5955c6c8bc128bc78eaf193a05f1dc8962d3f88ddf1246504ff  ./tests/core.test.mjs
ce698d36a7b93256bc9cb235e337ea7ad3d58f901a2d664b85deb22c34b56bdf  ./tests/hardening.test.mjs
420413af7dbb79f734cd72c5c66e1c36d1ac9b691750fa4eacdb417d0416c890  ./usage-prompt.txt
3d97592499605199f19aabda4a5749fe0cf4182faae00cbd38a63ef250d8dece  ./validation/run-1.log
a2bb0b54af5f4d94d8f44c0556b75555d6e59d0699ee9a693d88b910374c5568  ./validation/run-2.log
d5206fcd539d0aecd9cf6f303ecce3b622c6708d51989cc8b0b677e83bb9de3f  ./VERIFICATION-REPORT.md
```

Complete authorized SKILL.md contents:
````markdown
---
name: port-authority
description: Runtime hygiene for Replit apps and other supported hosts. Use for EADDRINUSE, stale or orphaned processes, blank previews, conflicting or hung validation, workflow-capacity problems, and prevention during setup. Default to read-only port discovery, managed service lifecycles and a single local lease only for actual conflicts. Advanced reclaim, attested development exceptions, named resources, priorities and reentry require explicit scope and their real capabilities. No Failure Gate, new validation tiers or separate Heavy skill is required.
---

# Port Authority — Core Runtime Hygiene

## 1. Scope and authority

One canonical skill, with a small default contract and optional advanced controls.
Use **audit**, **prevention**, **repair**, or **definition/package authoring** according
to the user's request. Authoring/installing a skill definition does not implement
its app contract, activate scripts, change workflows or start validation.

Core covers port/process discovery, managed service lifecycles, actual resource
conflicts, finite execution and safe owned-work cleanup. It does not supply a task
registry, approval system, validation tiers, baseline-ignore catalog, diagnostic retry
policy, completion service, automatic reclaim, scheduling or remote coordination.

Respect the actual adopted validation contract and version: Failure Gate Core,
full v4, or the verified existing host policy. Never import v4 ignore/provenance/retry
requirements into Core or create a second execution authority. Unknown governing
policy blocks dependent execution, not independently permitted read-only discovery.
No named companion skill is an ordinary prerequisite.

Read [the core runtime contract](reference/runtime-contract.md) before implementing,
adapting, testing or activating runtime controls. Read
[advanced controls](reference/advanced-controls.md) only when those features are
requested or an audited dependency needs an explicitly approved extension.
Use [symptom guidance](reference/symptom-guidance.md) only for the affected symptom.

Use canonical `.agents` sources and the full applicable reference closure.
An authorized original package may be the source for new definition installation;
do not treat a runtime mirror, alternate definition or remembered prompt as authority.
Choose routine programming methods within approved boundaries without a coding diary.
Material scope, safety, permissions, budgets, acceptance or protected-plan changes
require their actual amendment route and affected-evidence renewal.

## 2. Audit the affected boundary

Before affected changes, establish only the relevant current evidence:

- Actual listeners, process incarnations, ownership/ancestry and supervising service.
- Authoritative service ports, preview/proxy routing and managed lifecycle commands.
- Actual validation aliases/hooks/callers and shared ports, files, database or other
  resources when contention is involved.
- Workflow inventory and real capacity evidence when a limit error is involved.
- Actual startup/health contract and relevant failure observations.

Names, bare PIDs, truncated listings and port numbers alone prove neither ownership
nor permission to stop work. A free port is an observation, not a reservation.
Unreadable or incomplete discovery is **unknown**, not free or safely stopped.
Continue independent authorized work when one boundary is blocked.

Before stopping a service, signaling processes or cutting over live callers, explain
the consequence and obtain genuine authorization for the exact disruption; reuse
existing approval only when it covers that action. Do not restart unrelated work,
kill editors/supervisors, erase uncertain locks or change production unasked.

## 3. Managed services and ports

Use the host's real named managed lifecycle for persistent services/watchers.
Do not use `nohup`, ad-hoc detached shells or workflow proliferation to evade limits.
Finite validation is a bounded job, not a persistent service.

Match configured service ports to actual bind and preview routing. Multiple services
must not accidentally inherit the same port. Prefer correcting startup/lifecycle
ownership to repeatedly clearing listeners. Stop/restart an exact managed service
through its supported authorized host interface; verify old ownership ends and the
intended service becomes healthy before saying the conflict is repaired.

Default `scripts/free-ports.mjs [--dry-run] PORT...` is **read-only inventory**.
It cannot reclaim an existing listener. Busy targets remain protected; missing
attestation/reclaim adapters do not block this ordinary unmarked inventory.
Production-marked template execution is denied; no default development exception.

Unmanaged/orphaned targets needing signals require the advanced reclaim contract,
or a separate genuine host recovery route under its own scope. Core never makes a
local manifest or an action flag sufficient authorization. Failure Gate Core's
owned-child cleanup is not permission to reclaim pre-existing processes.

When workflow capacity is actually scarce, reserve slots for persistent services
and use the verified finite-job route for tests. Consolidate only authorized affected
commands. Discover actual limits, not a universal workflow cap. If removal is followed
by a contradictory capacity error, compare inventory, allow one bounded wait/retry
when appropriate, then report the unresolved host discrepancy; never retry forever.

## 4. Serialization only for real conflicts

Serialize commands that actually share mutable outputs, database state, ports or
demonstrated scarce resources. Suite size or multiple services alone is not a gate.
Independent checks remain independent but retain their finite supervision.

Prefer an existing audited equivalent lock. The bundled core command is:

```sh
VALIDATION_LOCK_TIMEOUT_MS=<approved-queue-ms> \
VALIDATION_LOCK_MAX_HOLD_MS=<approved-execution-ms> \
node scripts/validation-lock.mjs -- <command> <args...>
```

Core uses one outer local lease and unwrapped inner commands. All conflicting aliases,
pre/post hooks, nested runners and workflows must use the **same canonical lock file**.
Record their actual caller-to-lock mapping. The default `global` label is not
hierarchical; different lock files do not coordinate. No blanket lock for unrelated
work. Core rejects named-resource/priority CLI options and inherited reentry.

Inspect the complete allowed command tree before wiring: no daemonization,
untracked remote work or unobservable escapes. The local Linux template is
cooperative supervision, not a distributed lock or hostile-code sandbox.
Missing coverage/containment blocks that safety claim.

Queue, execution and bounded termination are distinct limits. Stale heartbeat,
elapsed hold time, parent exit, a delivered signal or a closed socket never proves
owned work stopped. Retain exclusion on uncertain discovery, journal failure,
surviving work, an interrupted transition or incompatible legacy state. Use the
real authorized recovery route; never age-delete leases or insert healthy flags.

## 5. Execution, health and acceptance

Use the adopted checked/authorized runner and its required coverage and evidence.
Port Authority neither registers tiers nor grants direct diagnostic execution.
Required finite execution and transitive cleanup apply even without serialization.
Reuse a genuinely verified host supervisor rather than inventing parallel policy;
the bundled lease supplies local safety, not authorization or parent-wide accounting.
Do not widen limits, reset inherited budgets, skip tests or rerun until lucky.

For affected API health probes, test the real routed request against the actual
expected status, JSON media type/body and service-specific healthy fields. Reject
HTML-200, malformed/wrong-service/unhealthy bodies and unexpected redirects.
Requests need real finite cancellation. Static-only apps need no invented backend.
Restart only affected managed services when changed configuration needs it.

Freeze the applicable requirements and expected outcomes before implementation.
Verify actual installed callers/wiring, not file presence, a README, fixtures or a
native Done label. For newly activated controls, obtain two consecutive authorized
host acceptance runs without manual port/process/lock intervention between them.
Record raw results separately from assessment; a correct expected denial/nonzero
can pass its case but cannot satisfy a missing implementation or runtime capability.
Keep owned repairs and adopted failure policy intact.

Per control/caller, report **STAGED**, **CORE_VERIFIED**, **ADVANCED_VERIFIED** or
**LIVE_RECLAIM_ENABLED** only for the evidenced scope. Independently report failed,
blocked, not-run and justified-not-applicable checks. Staging and isolated tests
do not prove host activation, validation completion or independent acceptance.

When independent verification is required, inspect first, list gaps before scoped
repair, invalidate affected proof and obtain fresh independent post-repair acceptance.
Use canonical Paired Task Orchestration if it is actually selected; do not embed a
second pairing protocol here or automatically create tasks, approvals or hooks.

## 6. Package adoption and migration

Verify the complete source/package manifest and applicable relative links. Inspect
existing scripts/callers before staging; place inactive files outside `.local` and
never overwrite active runtime wiring just to install a definition. Runtime lease
state alone may use disposable `.local` paths. Tests use private fixture directories.

Migrate explicitly: old resource/priority/reentry/reclaim callers need either an
authorized core redesign or the explicit advanced profile and its real dependencies.
The switch selects features, never supplies permission. Preserve lease v2 identity,
retained recovery disposition, historical evidence and the active contract until
authorized cutover. Do not silently change protected plans or every project's copy.

Report the actual source revision, affected controls, changes, caller mapping,
effective limits, tested snapshot, expected/actual results and exact remaining action.
Keep definition delivery, app implementation, independent acceptance and runtime
readiness separate. No automatic skill publication, migration, merge or deployment.

````

