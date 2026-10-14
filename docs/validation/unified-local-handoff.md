# Narrowed Unified migration handoff

**Final state: BLOCKED for activation; local implementation and its bound-tier
verification PASS.** No cutover has occurred.

## Authority and scope

The owner instruction in
`attached_assets/Pasted--text-Implement-the-narrowed-Failure-Gate-Unified-migra_1791951919409.txt`
authorized gate-only implementation and conditional cutover, not infrastructure,
production changes, remote CI or destructive recovery. Source inspection began
at revision `ad3d4dfcebff84405ed5dfa4780bb8e42e530c17`, branch `main`.

The sole canonical target remains
`.agents/skills/failure-gate-unified/SKILL.md`, SHA-256
`f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12`.
Policy remains staging. There is no claim that Unified governs general new work
yet. The narrowed scope supersedes expanded coordinator/recovery prerequisites
in prior readiness proposals, not historical evidence or canonical protections.

## Delivered

- A supported local enrollment and activation command,
  `scripts/configure-local-gate.mjs`.
- Real-path/filesystem/boot-bound authority receipt, not authority inferred from
  an environment identifier. Missing/stale/copied receipt denies execution.
- One exact-spec pre-cutover migration allowance, transactional permanent
  reservation and fixed tier; no general staging admission.
- Activation requires a completed current full bound-tier run, quiescence,
  raw-log integrity, matching run/review source fingerprints and independent
  acceptance with task reconciliation. No retry-only PASS can activate.
- Regression fixtures for actual subprocess/plan-guard context, copied-tree
  rejection, restricted bootstrap and activation evidence drift.
- Package forwarding repair: `pnpm run TIER -- ID` now preserves one ID.
- `AGENTS.md` and `unified-local-execution.md` document admitted/denied routes,
  scope, recovery and caller coverage. CI and resource-mutating post-merge setup
  remain independent, not alternative gate validation routes.

No app runtime, database, sketch, upload, credential, provider, deployment or
CI workflow code was changed. Existing credential filtering and authorization
checks remain intact. No production or paid provider requests were made.

## Task and observed verification

Task ID: **FGU-81af9606-cc13-465c-99a0-820e95ec1e03**.
Bound tier: **test-fast**, adequate for gate-only control changes, with owning
gate integration fixtures and Regression Guard. No other live tier was invoked.

1. `node scripts/configure-local-gate.mjs enroll-migration`: completed restricted
   local enrollment; policy remained staging.
2. `node scripts/new-plan.mjs docs/validation/unified-local-migration-spec.json`:
   provisioned the above ID and sealed environment-local plan.
3. With `UNIFIED_TASK_ID` and `TASK_PLAN_FILE` exported,
   `node scripts/validate-task-plans.mjs`: bound plan verified; strict guard PASS.
4. Initial `pnpm run test-fast -- ID`: BLOCKED before tests because forwarding
   retained the separator. Repaired argument parsing; added owning fixture.
5. Same bound-tier command: **PASS**, run
   `664621dd-a244-4522-8e6f-47bd631fcc01`, 2026-10-14 04:28:54–04:29:07 UTC.
   Gate **30/30**, Regression Guard **21/21**; no failures, cancellations or skips.
   Both supervised processes exited zero and reported quiescent cleanup.
6. Independent review: implementation **PASS**; see
   [attributed acceptance](unified-local-acceptance.md). Native-state uncertainty
   prevents claiming complete cutover acceptance.
7. Public preview rendered the unchanged app. This is only a visual smoke
   observation; sign-in/data flows were not tested. Existing development-key
   and experimental WebGPU warnings appeared.

Raw report/logs are under `.local/failure-gate/runs/ID/RUN/`, with hashes in the
report. Plans remain under `.local/tasks/`, not bulk-committed. Previous staged
test evidence and source manifests are retained as historical snapshots, not
misrepresented as hashes of the modified source.

## Preserved state and unavailable routes

Original native IDs/contracts and historical plans were not modified. Native
#2 retains its original pre-cutover contract, with no invented gate ID/tier.
No previous gate records existed; the sole new registry record is this migration.
The baseline catalog and all existing historical evidence are unchanged.

`test-standard` remains registered but was not executed or certified operational
here. Plus/heavy remain blocked by their existing unavailable resource routes.
Only private guard fixtures exercise other tier bindings, wrong-tier rejection
and duplicate-target control. Automated owner closure remains fail-closed;
owner-directed administrative reporting must not imply test PASS.

## Recovery

Existing Remix: **owner-confirmed**, not independently agent-verified,
`4b60cdc8-3fdb-439e-b554-21dd7e77a03e`. Source anchor:
`817e478a886a46ff919d9ff1c681e3d78324406f`. Exact copy provenance and untouched
external-resource recovery remain unknown; see `resource-recovery-coverage.md`.
No additional Remix or external backup was made.

Stop gate admission before approved source recovery. Preserve all consumed IDs,
tombstones and evidence newer than the recovery snapshot; never overwrite them
with an older ledger. Missing or stale local authority blocks automatically.
Review uncertain leases and identity history before any separately approved
re-enrollment/recovery. No live-resource restoration or deletion was tested.

## Exact remaining blocker

The existing project acceptance policy requires fresh in-flight native-task
reconciliation. Available supplied snapshots and local history do not establish
current authoritative host state. No known in-flight task was silently changed,
and no global absence is asserted. Activation was not attempted.

The remaining technical action is a supported current host-task read and
preservation of any active contracts, then an attributable completed acceptance
record and the already-authorized activation command. If that read cannot be
obtained, relaxing the fresh-read requirement in favor of the supplied snapshots
would require a specific owner decision; it is not implied by implementation
approval. No repeat routine cutover approval is needed.
