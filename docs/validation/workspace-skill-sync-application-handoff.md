# Workspace skill sync — application handoff

## Scope, authority and baseline

This delivers repository implementation of the canonical
`.agents/skills/skill-mirror-sync/SKILL.md` contract `workspace-skill/v1`.
The definition was read in full and is unchanged; its SHA-256 is
`1109c1439bb2598f8fb67b0d56a4603ec544c430b12f1fb19551b8cdbaf9db68`.
No archive or runtime mirror was used as a source. No private instruction
content, explicit workspace source location or credential belongs in this record.

Before implementation, both root helper entrypoints were absent, the worktree
was clean, and the readable baseline catalog contained no entries. This is
not a claim that all historical project checks were clean.

The owner explicitly approved adding the isolated suite to `test-fast`.
That focused gate maintenance preserves all existing checks and time limits;
its maintenance checks passed 88/88 tests before application implementation.
No historical binding or task record was manually rewritten.

The supported provisioner allocated
`FGU-06f4e83c-1fc9-423e-a111-28840a38948e`, linked to native task #53.
The complete sealed scope, outcomes, exclusions, steps, baseline declarations
and normal Regression Guard map were persisted to the native task and read
back exactly. Plan SHA-256:
`321d66e0e086987c87be3ea0e1078ab656d33560ee87d4e11f33d9c19c06907c`.
Admission and the selected-plan guard passed under the current Unified contract
and current Regression Guard revision. Host lifecycle and authorization were
Agent-observed, not inferred from a caller-authored approval flag.

Classification: security/privacy, data integrity, concurrency/lifecycle and
compatibility boundaries. No exception, deferral or baseline exclusion is used.
This is cooperative repository enforcement, not interception of arbitrary
editors, the platform's Start button or task completion.

## Actual wiring

Root `package.json` provides:

```sh
pnpm workspace-skill:refresh -- --contract-version
pnpm workspace-skill:status -- --contract-version
pnpm workspace-skill:refresh -- --skill example
pnpm workspace-skill:status -- --skill example
```

Both invoke `python3 -B scripts/workspace_skill_sync/cli.py` with their
operation name. Python's standard library is already available to the existing
gate supervisor; no package installation or dependency changes were needed.
`scripts/package.json` is therefore unchanged.

The version probe returns only `workspace-skill/v1` and LF, without importing
the implementation or accessing skill state. Invalid arguments are rejected
before state access. Operations emit exactly the two specified JSON keys and
one bounded slug reason on failure; there are no paths, stack traces or skill
bodies in CLI errors. `.npmrc` uses `reporter=silent` to suppress pnpm's own banners and lifecycle
diagnostics so the documented root commands also satisfy the exact byte
contract, not merely their Python subprocesses. This changes package-manager
verbosity, not any workload; an explicit reporter remains available to callers.

Implementation:

- `protocol.py`: strict JSON, schemas, opaque revision, slug/path rules,
  unsigned UTF-8 sorting and length-framed SHA-256.
- `safe_fs.py`: descriptor-relative no-follow traversal, regular-file reads,
  exclusive creation, local-filesystem allowlist, guarded Linux renames and
  durable file/directory flushes.
- `inventory.py`: full recursive source inventory, exact manifests, staging
  and complete projection-byte validation.
- `transactions.py`: persistent nonblocking kernel flock, boot/PID/start-tick
  ownership, structured transactions, conservative recovery and temp cleanup.
- `engine.py`: complete refresh and rollback, source rechecks, read-only status,
  and `Helper.load(skill_id, files=None)`.
- `platform_authority.py`: unavailable trusted-host capability boundary.
  Production has no caller flag, environment boolean or local JSON override.

`Helper.load` never refreshes implicitly or executes supporting files. It
validates the full source and projection and obtains bytes under the same
exclusive refresh lock. Its return value contains only manifested files in
the requested skill, optionally narrowed to an explicit list. An unavailable
source or stale/unsafe projection raises a bounded failure; it never returns
an earlier snapshot as a fallback. This is a repository API, not a platform
Agent loader hook.

## Requirement and recurrence map

All cases below run through `scripts/tests/workspace-skill-sync.test.mjs`,
which supervises disposable Python fixture cases. No fixture adapter is
available to the production CLI.

| Label | Required outcome / recurrence | Delivered boundary and detecting evidence |
|---|---|---|
| R1 | Exact version, arguments, JSON, exit codes, redacted errors | `exact root pnpm entrypoints` and `cli_contract`: compare complete stdout/stderr, invalid combinations and every outcome/exit mapping, including injected unexpected private-looking exception text. |
| R2 | Only explicit source; no substitution or fabricated publication | `no_platform_authority`, `cli_contract`, `hostile_source`: absent source and unestablished immutable publication reject without projection writes. |
| R3 | Complete safe tree, unchanged bytes, opaque revision, deterministic inventory | `inventory_order_and_bytes`, `hostile_source`: hidden/binary/nested files and Unicode ordering; reject symlinks, unsafe names, FIFO, unreadable files, malformed revision, unexpected entries and empty directories. |
| R4 | Normative length-framed hash | `protocol_vector`: exact published `x` plus LF vector; distinguish otherwise ambiguous path/content concatenations. |
| R5 | Exact manifest and strict metadata | `manifest_strictness`, `status_hostile_metadata`: reject unknown/duplicate keys, types, lengths, versions, unsorted/duplicate entries, extra files, empty directories and invalid fingerprints. |
| R6 | Actual Git/deployment exclusions before copying | `ignore_boundaries`: use actual temporary Git indexes/ignore evaluation, reject tracked generated content and missing/overridden deployment rules; reject an unsafe control parent before writes. |
| R7 | Persistent kernel lock; same-host structured ownership | `persistent_lock`, `owner_recovery`: second descriptor and competing load/refresh cannot acquire it; lock inode persists; live/unreadable identities reject, start-tick changes and dead ownership permit recovery. |
| R8 | Conservative age rule and ownership-safe cleanup | `owner_recovery`, `uncertain_artifacts`: old unstructured owner may clear only after 900000 ms, recent/future owners block; malformed transactions, unknown directories, symlinks, live owners and unowned temps remain unchanged. |
| R9 | Owned transaction recovery, ordering and real interruption | `transaction_recovery`: absent/valid/corrupt destination with backup; restore before staging deletion. Kill a real Linux lock-holder after durable backup publication, then recover using process death and the released flock. |
| R10 | Preserve last intact backup on installation/rollback uncertainty | `rollback`, `rollback_uncertainty`, `uncertain_artifacts`: inject installation failure, failure after backup rename, failed restoration and occupied recovery staging; assert last valid bytes survive and uncertain artifacts remain. |
| R11 | Drift never installs mixed bytes or permits stale loading | `source_drift`, `refresh_and_locked_load`: mutate bytes/revision during staging, after installation and during loading; deny stale return, preserve/restore previous projection and recheck the source. |
| R12 | Read-only status, authoritative attestation, double-source validation | `status_read_only`, `status_hostile_metadata`: compare complete fixture names, inodes, modes, bytes, mtimes and ctimes before/after status; missing/unattested/malformed/symlinked metadata never passes. Access times are excluded because reads can update them by filesystem policy. |
| R13 | Requested manifested bytes only, validation/read in one lock | `inventory_order_and_bytes`, `refresh_and_locked_load`: another lock attempt fails inside validation; selected support bytes return unchanged; another skill and traversal requests cannot return. |
| R14 | Fixture-only writes; authored and runtime skills untouched | `fixture_only_writes`: intercept mutation directory descriptors and require fixture containment, including both rename parents; compare source, authored-skill and mirror fixture snapshots unchanged. Real runtime mirror bodies are not read by the tests. |

Projection/control roots are explicitly excluded in `.gitignore` and
`.replitignore`. Refresh evaluates the actual Git index/ignore behavior and
requires terminal literal deployment exclusions before it copies anything.
It does not edit exclusions automatically. Deployment matching deliberately
accepts a conservative, inspectable subset of ignore syntax rather than
guessing that a broad glob or later negation is safe.

## Validation and tested snapshot

Assigned tier: `test-fast`, using the supported root alias with the allocated
ID and observed native/sealed context. The workload directly includes the new
Node test entry; its existing gate, Regression Guard and Port Authority steps
and 120-second total / 60-second step budgets are preserved.

Observed pre-final-package-output run
`d2a7ea1d-9c63-4c9e-8176-a3029238f6ab` passed all four steps:
18 skill-sync, 56 gate, 32 Regression Guard and 10 Port Authority cases.
The final package-output assertion and bounded loader-error changes require
the renewed run recorded below.

Earlier failed runs were task-owned, not classified pre-existing: one fixture
expected lock rejection instead of the earlier actual Git exclusion rejection;
a later edit temporarily removed a required `stat` import. Both were repaired,
and the supported isolated retries passed. The added root-pnpm byte assertion
then exposed that pnpm's `loglevel` setting does not suppress lifecycle banners;
the supported `reporter` setting fixes this without changing helper output.
Retries are not substitutes for the complete tier.

Additional checks: selected-plan validation passed; the six unchanged
confirmation-boundary tests passed; `git diff --check` passed. Version probes
were also exercised through the root pnpm aliases. No browser, database,
provider, paid API, workflow restart or deployment is involved in this CLI-only
change.

**Final result: PASS.** Renewed complete tier run
`b4efb63f-9985-4a3a-89d1-bc6672dfdcec` passed all four required steps,
with no warnings, skips or failure classifications:

| Step | Tests passed | Raw log SHA-256 |
|---|---:|---|
| workspace-skill-sync | 19 | `d56084fb7c04104e62d5048e660473fd7049da4e18f910bba414f9bf5df40549` |
| gate-unit | 56 | `bdd75bc10be63892a513090e0ae572933525192abf23837b9b550c65792e40b8` |
| regression-guard | 32 | `b799a678b488ad45a4bb82c4d820b4ede6a816be0d4d71cca9721e68cb5a80c9` |
| port-authority-clock | 10 | `f61c45ae5ce28bd061ae7a10827a4096ebfe626b4e074c1fb513342234a8ca5e` |

The existing supported runner retains run/step logs under its ignored local
run directory and records the result in the task registry. The added root
pnpm assertion is included in the 19 skill-sync tests; its earlier isolated
retry `2fda9384-54f8-4131-af64-abd7d2c20b25` also passed but is not the
basis for final tier acceptance.

The unchanged application preview also loaded normally. Its existing
development-auth and experimental WebGPU warnings are not skill-sync failures.

### Tested implementation/configuration hashes

These cover the added Python files even though the existing runner's
Git-based implementation inventory does not enumerate newly untracked
indirect imports before merge. All are part of this delivery; documentation
and validation-ledger updates after the run do not change the tested code.

| File | SHA-256 |
|---|---|
| `.npmrc` | `1684b5e70684692c9328819849f9488b9bd47cd2796b690738a002d00dba69c1` |
| `package.json` | `874a7559e4b214cc443620256d291534a32c18c61c04d56998c08282de2455eb` |
| `.gitignore` | `fa6576d0327e03580d9af806ab0ee08c5263fce576efe0f72b7e9fed9f2c14bb` |
| `.replitignore` | `9c3a53ad93f48391668cc9b4544158c5239916a12c0c033dbf8855664cddbb26` |
| `docs/validation/unified-tiers.json` | `57506fdfe1696018165a8b3274e9a36c476126a71a5abfad36dd25390f1d1e5c` |
| `scripts/workspace_skill_sync/cli.py` | `1a1970d3891bb050dacddb184cb6b80feb41118bdeb3a152ff169b321686e125` |
| `scripts/workspace_skill_sync/engine.py` | `9e5e391a1d23a9cd80bb5428feb64565a7a64035480ca8863706735e8dc1eb28` |
| `scripts/workspace_skill_sync/inventory.py` | `d2f1e854a0db81e7c378b6b32fcd54a0e89f5cdbc3c216cf7b797d33267111c0` |
| `scripts/workspace_skill_sync/platform_authority.py` | `f852ff5f4ac7459a81316dfbe2633da41fbbe03f1a327380ba8329f91632f2af` |
| `scripts/workspace_skill_sync/protocol.py` | `43d9c27fca1c90430cf38ff2a9b3ce6b0ad0deca8d6091bcbd90991f33a3e7d7` |
| `scripts/workspace_skill_sync/safe_fs.py` | `95079a30d1080983a74286fbc2373ee4dbad2d2780e9476b2e33267f922a88b6` |
| `scripts/workspace_skill_sync/transactions.py` | `f2c7fa57bb0871f90af0d8a59392b6a1851967519b05e5efea79e5c561bd959e` |
| `scripts/tests/workspace-skill-sync.test.mjs` | `50a7b9f11a1b67543b2286d294a8e5f760f274d61958d995d53fecf88a818a17` |
| `scripts/tests/workspace_skill_sync_cases.py` | `ffba48c7b3f81cac1fd70c1c5e0920af1c245779f90161750ead1728ea13c3d5` |

## Platform limits and scope reconciliation

- The repository has no authoritative platform integration proving immutable
  source publication or identifying sidecars as platform attestations.
  Production capabilities therefore return unavailable. Publication is not
  inferred from a revision file, source timestamps, an uploaded archive,
  matching sidecar values or a caller-supplied boolean.
- A missing source produces `unavailable-source`. Without a source publication
  guarantee refresh/loading cannot operate. Without metadata attestation,
  status produces `unavailable-helper` when the source is otherwise available;
  parity remains unknown. The successful lifecycle is proven on isolated
  fixtures with explicitly injected fixture authority, not on private live
  workspace content.
- No live projection refresh was attempted, no runtime mirror or platform
  sidecar was provisioned, and no skill definition was changed.
- Supported host assumptions are same-host Linux `/proc`, local supported
  filesystems, `flock` and durable guarded renames. Network/unknown
  filesystems fail closed. Recovery does not use PID alone or an age timeout
  for malformed transactions.
- The helper validates repository ignore configuration, not a production
  deployment bundle. Nothing here establishes platform-wide enforcement,
  mirror-body equality, distributed coordination or deployment acceptance.
- No application consumer or platform loading path is silently replaced.
  A future trusted host integration must call the locked loader and supply
  genuine publication/metadata capabilities; it must not write its own
  attestation merely to make status pass.

These are the canonical contract's unavailable/unknown outcomes and the
task's explicit platform-provisioning exclusions, not deferred repository
safety requirements. Optional separate application verification has not run;
this handoff and executor evidence are not an independent review.

Two optional follow-ups were proposed, each dependent on this primary:
#62 for genuine platform-capability discovery/integration and #63 for
independent verification in a fresh checkout. They are proposals, not selected
or completed verification, and no acceptance result is claimed for them.
