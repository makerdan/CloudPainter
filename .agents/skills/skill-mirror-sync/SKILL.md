---
name: skill-mirror-sync
title: Skill Mirror Sync
description: >-
  Add, audit, project, invoke, validate, verify, or repair workspace-managed
  skills and their disposable runtime mirrors. Use when source selection,
  projection freshness, metadata, interrupted refreshes, locks, or mirror
  parity are uncertain.
---

# Skill Mirror Sync

Use this skill when adding, auditing, invoking, validating, repairing, or
investigating a workspace-managed skill projection or runtime mirror. Keep the
boundary one-way and fail closed: the workspace source is authoritative, the
project projection is generated, and the runtime mirror is disposable.

## Authority and boundaries

- `WORKSPACE_SKILLS_SOURCE` is the required, explicit, authoritative
  workspace/platform source. Treat its workspace-wide `.workspace-revision` as opaque;
  it must be present and non-empty. Never invent, infer, or silently substitute
  a fallback source.
- The generated project projection belongs only under
  `.agents/skills/.workspace-projections/`. Project-authored skills elsewhere
  under `.agents/skills/` must not be overwritten or removed.
- `.local/custom_skills/<skill-id>/` is a platform-owned runtime mirror. It is
  downstream and disposable. Never edit it directly, promote it back, or use
  its body, timestamps, or metadata to claim that the workspace source is current.
- The direction is workspace source → generated project projection → runtime mirror.
  A runtime mirror never flows back into either upstream stage, and repository
  automation must not simulate platform provisioning by writing its sidecar.
- Do not copy private workspace instructions, credentials, secrets, or a
  reconstructed registry into tracked repository files.

## Helper entrypoints and prerequisites

The contract defined here is `workspace-skill/v1`. It specifies helper behavior;
installing this instructional file does not install commands or establish that
a host or platform implements this version.

1. Locate the host's `package.json` scripts named `workspace-skill:refresh` and
   `workspace-skill:status` and inspect their actual implementation. Both must
   implement this contract and accept `--contract-version`, returning exactly
   `workspace-skill/v1` plus LF, exit 0, without reading or changing source,
   projection, lock, or mirror state. A version response alone is not evidence
   that the implementation satisfies the safety rules below.
2. If either entrypoint is absent, inaccessible, incompatible, or cannot be
   inspected, report `unavailable-helper` and stop. Do not guess a script path,
   run an alternate command, install a helper, or copy files manually. Creating
   or adapting an implementation requires separate authorization.
3. Run commands from the repository root. The version probe accepts only
   `--contract-version`. For a refresh/status operation, accept exactly one
   `--skill` value matching `[a-z0-9]+(?:-[a-z0-9]+)*`, with length 1–64 ASCII
   bytes. Unknown, duplicate, or missing arguments, including a combined version
   probe and operation, are rejected before mutation with exit 4.

```sh
pnpm workspace-skill:refresh -- --skill <skill-id>
pnpm workspace-skill:status -- --skill <skill-id>
```

Refresh rebuilds the entire source inventory, not just the requested skill;
that skill must exist before mutation. Refresh never provisions runtime mirrors.
Its outcomes are `pass` (0), `invalid-contract` (1), `unavailable-source` (2),
`missing-skill` (3), `unavailable-helper` (4), `busy` (5), and `refresh-failed`
(6, including source changes and failed installation). Status retains the
four metadata outcomes defined below; helper/argument incompatibility is exit 4.
For operations, stdout is one UTF-8 JSON object with exactly `outcome` and
`skillId`, followed by LF. `skillId` is the validated requested ID, or JSON null
for invalid arguments; `outcome` is one of that command's outcomes above.
On failure, stderr is one reason code matching the slug rule, followed by LF,
without private data, stack traces, or paths. Success has empty stderr.
The version probe instead uses the fixed version response above.
Callers report a missing command as
`unavailable-helper`; they must not interpret the shell's exit code as a
successful helper outcome.

## Exact metadata and fingerprint format

These definitions are normative, not examples of existing platform metadata:

- The source root contains only `.workspace-revision` and immediate skill
  directories whose IDs satisfy the slug rule above. The revision is a regular,
  non-symlink file containing valid UTF-8 and at least one non-whitespace
  character. Preserve its complete decoded text, including any trailing LF:
  do not trim, normalize, or infer a revision from a timestamp. The source owner
  must publish an immutable tree per revision and never reuse a revision for
  different bytes. If that publication guarantee cannot be established, stop
  with `unavailable-source`.
- Every skill contains a regular `SKILL.md`. Its recursive inventory includes
  all regular supporting files, including hidden files. Reject symlinks at
  every path component, special files, unreadable entries, and empty directories.
  Relative paths use `/`, valid UTF-8, and no absolute prefix, backslash, control
  characters, or empty, `.` or `..` components. Do not normalize path spelling.
  Reserve `.workspace-skill-metadata.json` at the skill root for platform
  metadata: its presence in source is invalid.
- Sort IDs and relative paths by unsigned UTF-8 byte order, never locale order.
  File bytes remain unchanged. For each skill, SHA-256 hashes the ASCII bytes
  `workspace-skill/v1` followed by one NUL byte, then, for each sorted file:
  an unsigned 64-bit big-endian UTF-8 path-byte length, those path bytes, an
  unsigned 64-bit big-endian content-byte length, and those content bytes.
  There are no other separators, trailing bytes, or newline conversions.
  Represent the digest as exactly 64 lowercase hexadecimal characters.
  For the single file `SKILL.md` containing the two bytes `78 0a` (`x` plus LF),
  the digest is
  `f113149da3d0f648ad79425de0c84f3a975d12b7032555f02a55888d6e5d4f1a`.
- Write the projection manifest at
  `.agents/skills/.workspace-projections/.workspace-manifest.json`.
  Its exact object fields are `format`, `sourceRevision`, and `skills`.
  `format` is `workspace-skill/v1`; `sourceRevision` is the exact revision text;
  `skills` is a sorted array of objects with exactly `id`, `files`, and
  `fingerprint`. `files` is a sorted array of objects with exactly `path` and
  `bytes`; `bytes` is an integer from 0 through 9007199254740991 inclusive.
  All IDs, paths, byte lengths, and fingerprints must match the complete source
  inventory. Only that manifest and the declared skill trees may occur in the
  projection; only directories needed for declared files are allowed.
- The platform sidecar is a UTF-8 JSON object with exactly `format`, `skillId`,
  `sourceRevision`, and `fingerprint`, using the same types and rules.
  It is an authoritative platform attestation, not something repository code
  may synthesize. The platform must identify it as authoritative for this
  contract; otherwise report parity unknown, even if its values happen to match.
- Reject unknown fields, duplicate JSON keys, wrong types, duplicate or unsorted
  array entries, invalid paths, invalid lengths, and unknown format versions.
  JSON key order and insignificant whitespace do not affect equality.

## Lock, ownership, and recovery format

Helper-owned control data belongs at
`.agents/skills/.workspace-projection-control/`, never inside a skill tree.
Both the control directory and projection must be excluded from version control
and deployment before refresh can copy private instructions. Verify the host's
actual ignore configuration; if either is not excluded, return
`invalid-contract` without editing configuration.

- This version requires a local filesystem, an OS advisory exclusive `flock`,
  and same-host Linux process identities. If these are unavailable, return
  `unavailable-helper`; shared cross-host lock directories are unsupported.
  Open `refresh.lock` without following symlinks and acquire its exclusive lock
  non-blockingly. Failure or uncertainty is `busy`. Keep the descriptor open
  through recovery, copy, installation, validation, and cleanup. Never unlink
  or replace this lock file: doing so creates competing lock inodes.
- `owner.json` has exactly `format`, `nonce`, `pid`, `bootId`, `startTicks`, and
  `createdAtMs`. `format` is `workspace-skill/v1`; `nonce` is a lowercase UUIDv4;
  `pid` is a positive integer; `bootId` is the host's Linux boot UUID;
  `startTicks` is the non-negative decimal string from `/proc/<pid>/stat`
  field 22; `createdAtMs` is a non-negative integer Unix timestamp in milliseconds.
  Compare boot ID and start ticks, not PID alone. On this verified same host,
  a changed boot ID, absent PID, or changed start ticks proves the old owner
  dead. A matching live process or unreadable identity is `busy`.
- Only after acquiring the kernel lock may the helper replace dead-owner
  metadata. Unstructured regular owner metadata may be cleared only when its
  mtime is at least 900000 ms old relative to the host clock, is not in the
  future, and no process holds the kernel lock. Other uncertainty is `busy`.
  This timeout is for abandoned lock metadata, not source freshness.
- Before creating work, atomically write `transaction-<nonce>.json` with exactly
  `format`, `nonce`, and `owner`; `owner` is the structured owner object above,
  with the same nonce. Then create only `stage-<nonce>` and `backup-<nonce>`
  in the control directory as needed. UUIDv4 means the exact pattern
  `[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`.
  Control records and staging/backup roots must be non-symlink direct children
  of the control directory, on the same filesystem as the destination. Reject
  symlinks in their parent paths and recursively inside snapshots.
  A matching name alone never proves ownership.
- Recovery requires a valid transaction record, matching directory nonce,
  a provably dead structured owner, and the held kernel lock. Never apply the
  unstructured-metadata timeout to malformed transaction records or unknown
  directories. Preserve them and report `busy`.
- If an owned backup exists and destination is absent, restore the backup by
  rename before deleting staging. If both exist, keep the destination only
  after full source/manifest/byte validation; otherwise rename it to the
  transaction's unused staging path, then restore the backup. If that staging
  path is occupied or any recovery rename fails, preserve all remaining
  artifacts and report `refresh-failed`; do not delete the last intact backup.
  Restoration is not permission to load an older projection: full source
  validation is still required. Without a backup, preserve any destination
  and remove only proven-owned abandoned staging.
- Write JSON control records using an exclusive temporary regular file in the
  control directory named `record-<nonce>.tmp`, then atomic rename. Its nonce
  must match the current structured owner; never overwrite an existing temp
  file. Abandoned temp records may be deleted only under the lock when their
  parseable structured owner is provably dead; otherwise preserve and report
  `busy`. Flush record contents before publishing a rename; flush affected
  parent directories after every rename or removal before proceeding.
  Remove a transaction record only
  after its artifacts are handled successfully. `pid` identifies the helper
  process holding the lock descriptor, not its caller. Remove the current `owner.json`
  only if its nonce still matches, then release the kernel lock in `finally`.

## Source and fingerprint contract

Before loading a workspace-managed skill, validate the source and projection:

1. Resolve only `WORKSPACE_SKILLS_SOURCE`; if it is unset, unreadable, not a
   directory, or has an empty `.workspace-revision`, stop with an unavailable or
   blocked result. Do not load an older projection.
2. Discover deterministic immediate source directories. Each skill directory
   must satisfy the exact slug rule and contain `SKILL.md`. Recursively enumerate every
   regular supporting file, sort paths deterministically, and reject symlinks,
   special files, and unexpected source entries.
3. The projection manifest records its format, source revision, sorted file
   lists, and each skill fingerprint. The authoritative fingerprint is
   SHA-256 over the length-framed bytes defined above. Compare the opaque
   revision and fingerprint exactly; do not
   derive either from timestamps. MD5 is not an authoritative fingerprint.
4. Reject a missing or malformed manifest, missing or extra files, a revision
   mismatch, a fingerprint mismatch, or any source change detected during the
   copy. These are incomplete or stale projections, never a reason to load
   old instructions.

## Safe refresh and loading

Refresh only through the verified `workspace-skill:refresh` entrypoint:

1. Acquire its serialized, ownership-aware lock before inspecting or changing
   the projection. If a lock is live or cannot be safely inspected, report
   busy and do not remove active work.
2. Recover an abandoned lock only when its structured owner is provably dead,
   or unstructured owner metadata satisfies the exact 900000 ms rule above.
   Recovery must occur under the persistent kernel lock.
3. Under the lock, remove only helper-owned staging and backup directories
   with valid transaction records and the UUIDv4 names above. Never delete a
   similarly named or active directory.
4. Build the complete projection in a new staging directory. Validate its
   recursive manifest and all bytes before installation, then re-read the
   source revision and recompute the complete source inventory and fingerprints.
   If anything changed, discard owned staging and return `refresh-failed`;
   do not install a mixed snapshot or retry invisibly.
5. Install with guarded directory renames: move an existing projection to an
   owned backup, rename staging into place, and restore the backup if the
   install fails. Clean proven-owned staging and backup artifacts in a `finally`
   path, except artifacts needed for recovery after failed rollback.
   Never replace the destination by an unguarded delete-and-copy operation.
6. Validate the installed projection again immediately before loading. If the
   requested skill is absent or validation fails, fail closed. Return only
   requested regular files listed in the validated manifest. Validation and
   reading must share the refresh lock; obtain file bytes before releasing it.
   Do not execute supporting files as part of loading.

An interrupted refresh is handled by the same ownership-safe cleanup on the
next verified refresh. Do not manually rescue partial files, merge staging
contents, or load a prior projection while the source is unavailable.

## Read-only mirror status

Use the supported non-mutating command:

```sh
pnpm workspace-skill:status -- --skill <skill-id>
```

It reads the workspace source and the platform-owned
`.local/custom_skills/<skill-id>/.workspace-skill-metadata.json` sidecar. The
sidecar's format, skill ID, source revision, and fingerprint must exactly match
the canonical workspace metadata computed from the complete source inventory.
Read the source twice as specified for refresh; source changes are
`unavailable-source`. Status must never acquire/create a projection lock or
alter state. Reject symlinked mirror/sidecar paths without following them.
Interpret outcomes as:

- `pass` (exit 0): identity, revision, and fingerprint match;
- `mismatch` (exit 1): mirror metadata is unreadable, invalid, or differs;
- `unavailable-source` (exit 2): canonical source or revision cannot be read;
- `missing-mirror` (exit 3): the platform mirror sidecar is absent.

Exit 0 establishes matching authoritative metadata, not an independent audit
of the mirror's body. If the source lacks the requested ID, return
`unavailable-source`; if the platform does not attest this metadata format,
return `unavailable-helper` (4) and report parity unknown. No status path may
load private skill bodies as instructions.

Status is read-only. Do not write the mirror, sidecar, projection, or source
just to make a check pass. Do not print skill contents, source paths, secrets,
credentials, mirror values, or private workspace instructions. Missing
authoritative metadata is unknown/unavailable, not a pass. If the platform
does not expose authoritative mirror metadata, parity is unknown.

## Failure ownership and reporting

Classify before remediating:

| Observation | Owner | Repository action |
|---|---|---|
| Workspace content, revision, or publication is wrong | Workspace/platform skill owner | Report identity and bounded result; do not patch a mirror |
| Mirror is missing or stale after supported refresh | Workspace/platform provisioning or sync owner | Report environment, identity, and opaque metadata; request platform remediation |
| Canonical workspace source or validation metadata is unavailable | Workspace/platform owner | Report unavailable and preserve fail-closed loading |
| Projection implementation, boundary, or focused contract is wrong | Repository maintainer | Fix the repository contract or implementation |

Reports should contain the skill ID, environment, validation surface, bounded
outcome, and opaque revision or SHA-256 fingerprint when available. Include a
timestamp only if the reporting system requires it. Never fabricate a source
path, revision, fingerprint, manifest, sidecar, or success result. Hand-editing
`.local/custom_skills` is never remediation.

## Prohibited shortcuts

- Do not edit `.local/custom_skills`, reverse-promote its files, or make a
  runtime mirror authoritative.
- Do not endorse a direct canonical-to-runtime copy as a substitute for the
  workspace-source and generated-projection stages.
- Do not use MD5, timestamps, file-body comparison alone, or a made-up
  fallback source as authoritative validation.
- Do not expose or persist private workspace-level skill contents.
- Do not bypass the lock, atomic rename/rollback, source-change check, recursive
  validation, or fail-closed behavior to make invocation succeed.
