# Regression Guard definition revision installation

## Authority, identity and scope

- Native installation task: **47**, “Update Regression Guard definition”.
- Required downstream file-only confirmation: **48**, “Confirm & Harden:
  regression-guard”, depends on installation. It may edit only the entry point
  under the existing Skill Install Confirmation contract; reference defects
  require authorized installation repair, not expansion of that file-only task.
- Downstream integration task: **49**, “Apply updated Regression Guard”, depends
  on installation and retains the existing dependency order. No new application
  verifier was selected or created. Task **46**, “Complete Unified preflight
  enforcement”, is separate existing work; do not duplicate it.
- Project: CloudPainter, repository `https://github.com/makerdan/cloudpainter`,
  policy projectId `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`.
- Inspected checkout: `/home/runner/workspace`, starting revision
  `14d7fabba24b72181394fcd8d8fe3a17cfd620c9`.
- Governing authorization: the owner-selected package and assigned installation
  plan, under canonical Unified's owner-directed gate-instruction maintenance
  exception. This operation does not allocate a Unified ID or bind a tier.
- Classification: definition/contract instruction maintenance with normal
  source-package recurrence coverage. It is not self-satisfying merely because
  tests accompany it, and it does not activate changed application admission.
- Pre-implementation inspection established that the assigned plan's normal guard
  identifies the concrete lost-instruction/broken-reference/unselected-review
  risks, the owning checker test file and the detecting assertions. No amendment
  or uncovered implementation scope was needed. Only read-only inspection and
  the authorized baseline maintenance checks preceded installation.

## Approved source and complete authoritative specification

Selected attachment:
`attached_assets/regression-guard-skill_(10.18.2026)_1792369873490.zip`.
Archive SHA-256:
`01fe5e8c0606f8f92e1a55b9ea3ca35f392fa4396993ba6e23ace959450621c1`.
The latest attachment reconciliation changes only the source attachment
reference: the selected ZIP is byte-identical to the earlier owner-selected ZIP.
All five archive members passed CRC/integrity checking before edits.

The **complete**, unabridged authoritative definition specification is preserved
in the following tracked files, not an environment-local task/submission path.
These links deliver the full approved text even when attachments are unavailable:

| Full specification / provenance | SHA-256 of exact approved bytes |
| --- | --- |
| [SKILL.md](../../.agents/skills/regression-guard/SKILL.md) | `6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1` |
| [reference/enforcement-contract.md](../../.agents/skills/regression-guard/reference/enforcement-contract.md) | `bdae119a887cda74dadbc6fded7ff7360e94c54fb57a858756ee4fdfa192d964` |
| [reference/delivery-handoff.md](../../.agents/skills/regression-guard/reference/delivery-handoff.md) | `2df6f93305e3757989bff36be1ab1bc7cc9deb3229ad703cec83e3ef1a4c9910` |
| [REVISION-NOTES.md](../../.agents/skills/regression-guard/REVISION-NOTES.md) | `0e1b11b5900591eafd6bb4134b25c91cf5a19416d4158feef5807f0edf8cf868` |

The two required relative links resolve within the canonical package. The
entry-point fingerprint before installation was
`fcda16a9910a91e1ace9933651acdf69d252766948bd379ee1bc5ee6a72f2031`;
it matched the planned old source, so no concurrent canonical change required
reconciliation. The prior version had no package reference links or reference
directory. Source installation supplies both references without blending an
alternate definition. Revision notes are preserved byte-for-byte as package
authoring provenance, not new instructions or evidence of host enforcement.

The archive's `application-prompt.txt` SHA-256 is
`76703c5c42d4bc0a73d10f343656fef2f0c30d9a85d514345cfff418969ba772`.
It was read as a planning instruction, not authorization to edit application
code, restart services, merge, publish or deploy. It is not installed as a skill
entry point.

### Original installation acceptance checks

- The canonical SKILL.md matches the attached revision (SHA-256
  6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1),
  including whole-scope classification, pre-implementation preflight, supported
  amendments and optional separate review.
- The canonical SKILL.md links to reference/enforcement-contract.md and
  reference/delivery-handoff.md and states that required delivery evidence is
  distinct from optional independent verification.

## Delivered changes and requirement map

The delivered snapshot is the starting revision plus only:

1. `.agents/skills/regression-guard/SKILL.md` — entire approved replacement.
2. `.agents/skills/regression-guard/reference/enforcement-contract.md` — exact
   approved reference and future enforcement acceptance cases.
3. `.agents/skills/regression-guard/reference/delivery-handoff.md` — exact
   approved required-handoff / optional-review template.
4. `.agents/skills/regression-guard/REVISION-NOTES.md` — exact package provenance.
5. `scripts/tests/check-regression-guard.test.mjs` — package fingerprint,
   reference closure and source-obligation assertions with disposable negative
   fixtures; fixture teardown explicitly observes root removal.
6. This installation handoff.

| Local label | Recurrence / expected outcome | Planned guard | Actual delivery / detecting assertion | Disposition |
| --- | --- | --- | --- | --- |
| R1 | Replacing the definition loses approved content | Normal source-package guard | `canonical Regression Guard package exactly matches the approved source fingerprints` hashes all four installed members, independently of semantic checks | Delivered; exact archive equality checked separately |
| R2 | A required reference is missing, unlinked or redirected | Normal source-package guard | `canonical package closes references...` resolves both links; `source-contract checks reject missing reference files...` removes each file/link and redirects each link in fixtures, requiring failure | Delivered; only disposable files mutated |
| R3 | Whole-scope, preflight or supported amendment obligations disappear | Normal source-package guard | `source-contract checks reject removal of every required obligation...` deletes each named obligation individually and requires an obligation-specific failure without invoking byte-hash acceptance | Delivered; source text assertions, not semantic enforcement proof |
| R4 | Mandatory unselected independent review returns | Normal source-package guard | Optional-review obligations in all three spec files are required; `source-contract checks reject blanket mandatory unselected review...` adds a blanket mandate to each, retaining optional text, and requires failure | Delivered; hash check also rejects any other unauthorized wording drift |
| R5 | Definition delivery is mistaken for integration activation | Scope boundary and tracked evidence | This map, exact sources and existing downstream native refs separate installation, adoption, delivery, validation and optional review | Integration not performed here |

Negative controls never change live application behavior or sealed plans.
The source-contract helper is test-local; it is not wired into provisioning,
amendment, execution, CI or any registered tier. Package checks intentionally pin
this installation revision. Future owner-authorized definition revisions must
update these source expectations and this handoff through gate maintenance;
changing test constants is not a supported adoption/cutover for live plans.

## Maintenance evidence

Owning command, used once before changes and once after the coherent installation:

```sh
timeout --signal=TERM --kill-after=5s 180s node --test --test-reporter=tap --test-timeout=45000 scripts/tests/check-regression-guard.test.mjs scripts/tests/failure-gate.test.mjs
```

- Baseline: exit **0**, **63 tests passed**, 0 failed, skipped, cancelled or
  todo; observed duration 15,630 ms. The failure baseline catalog was valid
  schemaVersion 1 with zero entries. That catalog alone was not treated as proof.
- Before edits: archive integrity 5/5; archive and old entry-point fingerprints
  matched the assigned plan. Existing definition link closure was vacuous (no
  package references); the new references were not claimed already installed.
- Post-installation: exit **0**, **68 tests passed**, 0 failed, skipped,
  cancelled or todo; observed duration 13,895 ms. All five new package cases
  passed, including each negative-fixture assertion. The delivered test file's
  SHA-256 is `f22e5ed3e90b0be4372b04142102bf3eac232664d610ef348dbef70e35b5a3ae`.
- `cmp` independently established byte-for-byte equality with each of the four
  approved ZIP members, including revision notes. Both reference files resolve
  from the canonical entry point. Node syntax checking and `git diff --check`
  succeeded.
- `git diff --exit-code HEAD` over all five preservation-table control inputs
  succeeded; none changed. Final status contained only the six delivered paths
  listed above and the original untracked source attachments.
- Both suites create disposable fixture roots; post-run inspection checks for
  remaining `regression-guard-*`, `cloudpainter-gate-*` and
  `cloudpainter-copied-gate-*` roots. Baseline and post-installation inspections
  both found none. The new source fixtures also assert successful root removal
  in their teardown. The existing cleanup supervision cases passed.
- These are bounded maintenance checks, **not a tier PASS**, application test
  result, remote CI run or independent review. No browser, provider, database,
  backup/restore, workflow restart or deployment operation is in scope.
- Flaky-test rule: a passing retry establishes intermittency, not pre-existing
  provenance. No failure is excluded without evidence.

## Preservation and recovery

The original source remains recoverable from the starting Git revision above.
No user file was reverted or overwritten beyond the approved entry point.
The following control inputs are preserved, to be checked unchanged at delivery:

| Unchanged control input | Starting SHA-256 |
| --- | --- |
| `.agents/skills/failure-gate-unified/SKILL.md` | `73254fc29ec62a3966fd16508ec20dcac6cc676f65fa309a5365d400dcccf2cc` |
| `docs/validation/unified-policy.json` | `b451d03e85b22982191034368f274d04b35f2242c9395d8eab6452f240bd4b20` |
| `docs/validation/unified-task-registry.json` | `bf86826d6a3a758900e309018a9c261130917059c13590a0d9fc4b506319a1a0` |
| `docs/validation/unified-tiers.json` | `65b976cda35e5283ec8492582964b194cfa9babf4b6b39afe4ae4f2fbd8b42a5` |
| `docs/validation/failure-baseline.json` | `352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871` |

Application files, account data, providers, database/schema, services,
deployments, remote workflows, mirrors/catalogs, historical sealed plans, tier
bindings and ledger records are untouched. Untracked source attachments present
at task start are left alone; they are not this task's code deliverables.

## Downstream integration obligations and review selection

**Definition delivery is not integration adoption.** No new Regression Guard
revision/cutover mapping is installed in the live policy. Existing authoring
instructions and historical reports describe their earlier delivery, not proof
of this revision's enforcement.

The existing supported provision/amend/check/bound-run entry points must be
rediscovered by task 49. Read-only inspection here found existing shared
`strictCheck` use in `scripts/failure-gate/plans.mjs` and the canonical skill in
`scripts/failure-gate/execution-sources.mjs`. These are existing caller/source
dependencies, not evidence that all new obligations are enforced. In particular:

- Establish current-versus-historical adoption through supported versioning; do
  not change old plans, IDs, reservations, bindings, ledgers or tier workloads.
- Reconcile whole-scope classification, deletion-marked versus executing removal,
  all allowed forms and verified deferral through actual supported inputs.
- Map pre-implementation cooperative preflight versus any genuine host hook;
  do not claim interception of native Start or platform completion.
- Support preparation/amendment before implementation, native/local revision
  consistency, current dispatch admission and pause/amend/resume after gaps.
- Distinguish safe draft helpers from read-only sealed admission and validation.
- Exercise real entry-point acceptance cases under separately authorized
  integration maintenance. These source checks do not substitute for those cases.
- Obtain the application prompt's requested **Remix backup before application
  edits**, using a supported route; if unavailable, request that owner action
  before integration edits. No Remix was created or verified here. Git recovery
  is not described as a Remix, and uncertain historical backup provenance is not
  reused. This definition-only task does not perform application edits.

Separate application verification: **not selected**, not pending required
acceptance. Required file-only confirmation is already queued as native task 48
under `.agents/skills/skill-install-confirmation/SKILL.md`; it is not optional
application verification and has not been performed by this installer. The
platform's completion checks likewise do not establish application adoption.
No duplicate follow-up tasks are needed: existing tasks 48, 49 and 46 cover the
planned next steps.

## Installation outcome

**PASS — definition installation and owning maintenance checks only.** No
validation tier PASS or application enforcement acceptance is asserted.
Both original installation acceptance checks are supported by exact source
equality, reference closure and observed maintenance results. The full approved
definition and references are durable tracked deliverables linked above; the
queued file-only confirmer can read them without the attachment or local task
archive. Optional application review remains not selected. Integration remains
assigned to the existing downstream work, not unfinished scope of this installer.
