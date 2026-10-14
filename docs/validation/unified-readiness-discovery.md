# CloudPainter — read-only readiness discovery

**Scope authorized:** read-only authority capabilities, configuration and recovery
metadata; no code/resource/credential/CI/policy changes.
Date: 2026-10-13 (America/Chicago).
Inspected source: `c301555a84139bef87bce44de7b1cf30b5edf2a8`.

**Discovery observations recorded. Overall readiness/cutover: BLOCKED.**
Metadata success is not successful implementation, backup restoration or active
Unified enforcement.

## Confirmed observations and limits

| Area | Observation and evidence | Gap / classification |
|---|---|---|
| Existing authority | `unified-policy.json` and `scripts/failure-gate/store.mjs` remain staged/local; `runner.mjs:195` refuses closure without an authentic adapter. | **Unknown:** shared authenticated allocator and owner-direction route. No supported signed native-task identity API was established by the inspected documentation. Do not interpret this as global absence. |
| Deployment | Supported `getDeploymentInfo()` returned success, isDeployed false, hasSuccessfulBuild false. | **Confirmed:** no published endpoint reported. There is no verified stable published coordinator URL. No URL was constructed from a development domain. |
| Development database | Metadata-only `executeSql` returned database_bytes **7,975,395**, project_backups_present **true**, failure_gate_schema_present **false**. | **Absent within queried scope:** a schema named `failure_gate` in this database. This does not rule out other names/external resources. Shared reachability across isolated task copies, quotas, retention and restore readiness are **Unknown**. |
| Production database | Read-only `SELECT 1` through the production metadata callback failed. The sanitized failure did not independently establish a specific no-database condition. | **Unknown:** current production database availability and recovery. An earlier resource record reported no production database at its own observation, but this failed fresh probe cannot reaffirm absence. No production user data was queried. |
| Secrets | `viewEnvVars(type: secret)` for development and production reported seven existing names in each environment. Values were not returned/accessed. | **Unknown:** validity, usable scope, recoverability, rotation and coordinator enrollment. Existence metadata is not an exhaustive runtime-credential inventory or authorization proof. |
| Existing app authentication | `checkClerkManagementStatus()` returned managed and dashboardAccess authorized. `artifacts/api-server/src/routes/admin.ts` defines application admin/account/generation permissions. | **Unknown:** mapping from the actual project owner to a gate-owner principal. Do not equate app admin, dashboard access or an executor credential with owner-directed closure. No account list or identity payload was requested. |
| Code recovery anchor | `git cat-file` confirmed `817e478a886a46ff919d9ff1c681e3d78324406f` exists; `git merge-base --is-ancestor` confirmed ancestry. A bounded read-only `git ls-remote gitsafe-backup HEAD` advertised the inspected current revision above. | **Confirmed:** local anchor and advertised remote ref. **Unknown:** remote object completeness, retention and successful restore. No fetch, clone, checkout or recovery copy was made. |
| Remix | Existing record identifies owner-confirmed project `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`; it is the edited current workspace. | Parent relationship, exact copy point, original optional database copy and immutable original preservation remain **Unknown**. No new Remix was created or independently verified. |
| Disposable resources | `initdb`, `pg_ctl` and `postgres` were found on PATH. | **Confirmed tool availability only.** No cluster, process, test database or browser was launched. Capability isolation, cleanup and accepted runner integration remain unverified. |
| Canonical Port Authority | `.agents/skills/port-authority/` contains authoring/manifest/report material, but no `SKILL.md` in the inspected directory. | **Absent within inspected canonical source:** executable skill definition. No mirror was used as authority. Keep the existing confirmation/runtime-readiness work separate. |

## Metadata queries

Development, read-only:

```sql
SELECT pg_database_size(current_database()) AS database_bytes,
       to_regclass('public.project_backups') IS NOT NULL AS project_backups_present,
       EXISTS (
         SELECT 1 FROM pg_namespace WHERE nspname = 'failure_gate'
       ) AS failure_gate_schema_present
```

Production, read-only: `SELECT 1 AS metadata_probe`.
No user rows, artwork, account identifiers, connection strings or secret values
were selected. No retention/backup-history interface was available in the
inspected database callback surface; those fields remain Unknown rather than
being inferred from database existence or size.

## Supported platform routes and unknowns

Official documentation consulted:

- [Task system](https://docs.replit.com/core-concepts/agent/task-system) and
  [task lifecycle](https://docs.replit.com/features/agent/task-lifecycle):
  isolated work and owner approval through task/chat interactions. They do not
  establish an inspected signed approval ingress for this coordinator.
- [External access tokens](https://docs.replit.com/features/deployment-customization/external-access-tokens):
  an automated network-access mechanism, not task-tier or owner-closure proof.
- [Remix](https://docs.replit.com/features/projects-and-artifacts/remix-an-app):
  documented file/config/history copying; optional database-copy selection and
  ownership-dependent secret-value behavior do not prove this instance's copies.

If a fresh independent Remix is needed before implementation and no supported
agent action is available, the documented minimal owner UI action is: **in the
apps list, use this app's three-dot menu → Remix this App**. Record the resulting
identifier and confirmation honestly; do not assume resource coverage. This
discovery neither requested nor performed that mutation.

## Proposed next scope — not yet authorized

Recommend a **local-only pre-cutover bootstrap**:

1. Implement the coordinator protocol/store boundary and narrow client roles in
   gate code, exercised only through synthetic private clients and native
   disposable PostgreSQL fixtures.
2. Test cross-client reservations, one-tier bindings, idempotency, amendments,
   uncertainty fencing, evidence manifests and isolated reconciliation.
3. Preserve staging, original native contracts, live registry/catalog and raw
   historical evidence. Fixture identities must never be presented as live IDs.
4. Record exact later enrollment/storage/deployment choices. Do not use the app
   database, publish a service, change secrets or CI, or expose routes as a
   substitute for the missing approvals.

Before that work, approve a named bounded bootstrap contract with exact test
commands/limits and synthetic target identities. This is not retroactive Unified
binding. Real live task provisioning remains denied until authoritative
provisioning and cutover are accepted.

Proposed contract label: **local coordinator bootstrap** (not a gate task ID).
Planned owning files: `scripts/failure-gate/` protocol/store adapters,
`scripts/tests/failure-gate-coordinator.test.mjs`,
`scripts/tests/failure-gate-recovery.test.mjs`, and a planned
`scripts/verify-unified-bootstrap.mjs` entry point. That entry point does not
exist yet and is not claimed as a verified command. If implemented, it must run
those two suites plus the existing gate suite through the existing supervisor:
180-second total workload deadline, 5-second cleanup, explicit TAP reporter and
45-second per-test deadline, a single bootstrap-target lease and a fresh evidence
path. It must use a private temporary HOME and allowlisted child environment,
native synthetic database/client fixtures only, no app database module singleton
or inherited credentials, and observable teardown. Missing tools, cleanup or
required tests block/fail rather than skip. No live tier is called authorized
by this bootstrap ceiling.

Actual shared durable authority, live namespace/privilege provisioning, owner
enrollment, external durable evidence storage, publishing and remote CI actions
need separate specific approval. This report does not choose an unverified
existing account/provider resource or treat the app database as disposable.

## Recovery before changes

Retain the current Remix, recorded local source anchor and advertised backup ref.
Before implementation, reconcile the recoverable code snapshot and any further
backup precaution under its approved bootstrap contract. Before live namespace
or data-affecting operations, verify the specific retention/restore route and
use a separately approved isolated restore target. No test may replace/delete
live app resources, restore an older identity ledger over newer IDs, or clear an
uncertain lease merely by age.

**Minimum next decision:** whether to authorize the bounded local-only bootstrap
implementation above. No receipts, app IDs, account lists or secret values are
needed from the owner for this decision. Infrastructure and cutover remain
separate decisions after their actual capabilities are proven.

Only discovery records were written. No enforcement control was newly enabled.
