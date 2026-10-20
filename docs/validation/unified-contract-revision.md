# Explicit canonical contract revision

**Historical revision 1 below. Current revision 2:** owner-directed gate repair,
recorded in `unified-gate-repair.md`, installs
`attached_assets/failure-gate-unified-2026-10-15_1792180022158.zip` exactly.
Archive SHA-256:
`36af4dd4fbfd792159e8804c60c1519e3cc9f3224d056a193b226116a58adf11`.
The canonical pin changes from
`d4eeb2a528f5e77af89bdd1b5c23f24cc3af58a2a3bb46d30046dd2ddbfdbab0`
to `73254fc29ec62a3966fd16508ec20dcac6cc676f65fa309a5365d400dcccf2cc`.
The owner-authorized portable gate supersedes the location-bound restriction;
existing task IDs, sealed contracts, tiers and historical evidence are unchanged.
The earlier admission failures and acceptance limits below describe their
inspection date, not current instructions. Old plans use their sealed template;
only new provisioning or a supported amendment applies the current template.

## Authorization and boundary

The owner explicitly requested installing the latest attached canonical skill
and recording a contract revision that resolves canonical source drift. This
authorizes the definition/policy-pin change, not authority re-enrollment,
implementation of recovery machinery, a new cutover, task rebinding, or a
declaration that every new contract obligation is operationally implemented.
No implementation task plan or fabricated gate ID is published by this record.

Pre-change source revision: `091c82a8b8283c41041cb8d22f65a6309a68b107`.
Only the canonical definition, policy revision metadata and discoverability
documentation change. Gate code, tier workloads, authority receipt, consumed
IDs, registry, baseline, prior acceptance files and historical logs are retained.
Pre-change inspection found one retained registry record, no recorded active
run, and no retained gate lease.

## Source lineage

- Canonical folder: `.agents/skills/failure-gate-unified/`.
- Attachment: `failure-gate-unified-reviewed-final_1792097479101.zip`.
- Archive SHA-256:
  `308f65bbcd275a6c58ee4cc6b99533a02070e78734886f91a97f4ca17b18c536`.
- Previously pinned contract:
  `f9ac675788e538f19de92b67e1be629d1daa5db0c2f8c4341d7abef35d48af12`.
- Intermediate installed definition, never pinned:
  `b04decfc03db49cab37c221f749f77be1000845d537ea4f9f6f6a25b629d1a06`.
- New approved definition and policy pin:
  `d4eeb2a528f5e77af89bdd1b5c23f24cc3af58a2a3bb46d30046dd2ddbfdbab0`.

The archive contains only `SKILL.md`. The destination also contained only that
file, so no extra file deletion is needed. Installation preserves archive bytes,
not the wording of the superseded version. No runtime mirror is edited.

## Existing contracts and admission

`contractRevisions` in the policy records this explicit change. Existing registry
records keep their original `contract`, ID, binding and evidence. No old record
is silently moved to the new contract. The existing runner rejects a task whose
recorded contract differs from the current pin; old evidence remains historical,
not authority to execute it under the new definition.

The new source describes stronger lifecycle, approval, workload-coverage and
revision expectations. Source installation is not proof that the implementation
satisfies all of them. No bound-tier PASS or independent operational acceptance
of those new obligations is claimed.

Policy mode and the original accepted cutover marker are unchanged. New work
targets the newly approved canonical definition, but execution remains blocked by
the separate stale-workspace-authority check. A supported repair and affected
verification/acceptance are required before ordinary execution can resume.
Do not reset staging, edit receipt metadata, or manufacture task IDs to proceed.

## Recovery coverage

The existing recorded migration Remix remains owner-confirmed, not independently
agent-verified: `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`, original source anchor
`817e478a886a46ff919d9ff1c681e3d78324406f`. The current pre-change Git revision
above preserves the immediate source/policy state. Exact Remix copy provenance
and resource coverage remain as documented in `docs/resource-recovery-coverage.md`;
no new backup creation or recovery test is claimed.

This source/metadata change does not touch databases, sketches, uploads, secrets,
provider accounts, deployments or external infrastructure. No additional recovery
exercise for those untouched resources is implied. Any later source rollback
must preserve newer consumed IDs/history and must not relabel old acceptance as
approval of different source.

## Verification scope

Verify exact archive-to-source bytes and inventory, matching policy pin, accepted
policy/catalog/registry inspection, unchanged retained records and the continuing
fail-closed workspace-authority rejection. These are source/configuration
checks, not a bound-tier validation run, restored admission or a new cutover.

Observed results:

- Installed `SKILL.md` and destination inventory exactly match the latest zip.
- Installed SHA-256, policy pin and revision target agree.
- `node scripts/check-failure-gate.mjs` succeeds: active policy, assessment
  `NOT_EXECUTION`, one registry record, no warnings. Canonical source drift is
  resolved.
- A read-only `policy(root)` execution-admission probe still rejects with
  `Copied, moved or stale workspace authority denied`. No workload was launched.
- Comparison with the pre-change revision confirms unchanged registry, baseline,
  original cutover acceptance, policy mode, cutover marker and authority settings.
- `git diff --check` passes.

**Requested source installation and explicit pin revision: PASS.**
**Ordinary gate execution and full operational adoption: BLOCKED**, pending the
separate supported authority repair and applicable verification of the revised
contract. No test-tier PASS is claimed for this metadata operation.
