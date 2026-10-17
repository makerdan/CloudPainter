# Cloud project and reference-photo storage

## Current behavior

CloudPainter keeps working sketches, autosave, and Saved sketches in browser
storage. Sign-in by itself never uploads a project. A signed-in user can open
**Export & save → Account backups** and explicitly create an immutable server
snapshot. Each snapshot contains the editable project and its embedded reference
photo; creating one leaves the browser copy in place.

Account backups are stored in PostgreSQL and scoped to the authenticated Clerk
user. Each project is capped at 2 MiB, each account at 20 snapshots and 32 MiB,
and the service at 128 MiB of backup payloads. Repeated network attempts with
the same request ID are idempotent. Users can list, restore, or delete their
account snapshots. Restore uses the existing project validator and browser
conflict checks, saving the current project in Saved sketches before replacing
it. Account switches remount the backup view and every server lookup is scoped
to the current authenticated user.

The local download/import flow remains available. It is still capped at 2 MiB,
validates the project before replacing it, checks for concurrent-tab changes,
and keeps a local recovery copy. No existing browser project is migrated or
uploaded automatically.

## Production capacity and request-envelope evidence

Evidence snapshot: 2026-10-16 (deployment and production-database checks; local
parser probe around 21:00 UTC). This replaces the earlier statements about whether
production resources exist; those statements are historical, not current
evidence.

### Confirmed

- Current application limits in `projectBackupStore.ts` are 2,097,152 bytes
  (2 MiB) per backup, 20 backups and 33,554,432 bytes (32 MiB) per account, and
  134,217,728 bytes (128 MiB) shared. The stored payload count is the UTF-8
  byte length of each backup string. These are application payload quotas, not
  database capacity limits.
- The route configures Express JSON parsing at 2,228,224 bytes (2 MiB plus
  131,072 bytes / 128 KiB). Its JSON body carries the backup as a string, so
  quotes and backslashes in the backup text are escaped again in the request.
  The schema also has a text payload, metadata columns, and two indexes; row,
  index, PostgreSQL storage overhead, other tables, and growth are not counted
  by the payload quotas.
- A local, client-validator-approved near-limit project used 8,884
  `background-fill` entries whose valid `rgba()` colors each contained 96
  quotation marks. `createProjectBackup` produced a 2,096,940-byte backup, and
  `parseProjectBackup` accepted it. Its compact request JSON was 3,873,856
  bytes, including 1,776,916 bytes of envelope/escaping overhead. An isolated
  local Express parser configured with the route's limit returned HTTP 413
  `entity.too.large`. This synthetic request was not sent to a published API.
- Independently, the route accepts a backup string up to 2,097,152 UTF-8 bytes
  and only checks its format/version/project-title shape. With the current
  string-in-JSON contract, a conservative route-level request-envelope bound
  is 4,194,368 bytes: twice the backup cap plus the fixed 64-byte envelope for
  a UUID request ID. A route-shape-valid repeated-quote serialization measured
  4,194,302 bytes and also received local HTTP 413. These bounds show that the
  current parser cannot accept every backup that meets the application's
  payload-byte cap.
- Replit's current documentation describes production database storage limits
  of 1 GiB on Starter and up to 100 GiB on paid plans, with a default 33 MB
  storage footprint. These are plan-level limits, not this account's current
  plan, usage, or remaining headroom. See
  [Development and production databases](https://docs.replit.com/features/data-and-storage/development-and-production)
  and [Publishing and Database Billing](https://docs.replit.com/billing/about-usage-based-billing).
- A 2026-10-16 search of Replit deployment documentation found no published
  global HTTP request-body limit or applicable source page.

### Absent within the inspected scope

- `getDeploymentInfo()` succeeded on 2026-10-16 and returned
  `isDeployed: false`, with no primary URL, deployment type, or successful
  build. There was no active published deployment for this Repl to inspect at
  that check. The API artifact's production build/run configuration is not
  evidence that it has been published.

### Unknown

- The production SQL read-only interface returned
  `Production database access requires an authenticated user.` No production
  metadata query succeeded. This does **not** prove that a production database
  is absent. Its identifier, plan, configured capacity, measured database and
  table sizes, backup-table presence/usage, and remaining headroom are unknown.
  Production metadata access must be available before these can be recorded.
- No production usage measurement or reserve calculation is available. The
  128 MiB shared payload quota is only a raw-payload ceiling; a reserve must
  also account for indexes, row/storage overhead, other tables, growth, and
  the actual database limit and usage.
- The published API's accepted maximum request size and any upstream proxy
  limit are unknown. Local route/parser behavior is not end-to-end acceptance.
  The Replit database plan limits do not imply any HTTP request limit.

## Readiness and next steps

Production cross-device recovery is not confirmed ready. There is no active
published deployment in the inspected scope, and database capacity and schema
state could not be read. Do not infer either from development data or the
earlier deployment note.

The smallest separate application change for the demonstrated local parser
gap, if the existing string-in-JSON request format is retained, is to raise the
route parser limit to at least 4,194,368 bytes and add a regression test for
the escaped-envelope case. This would only address the local parser; it would
not establish upstream acceptance. No quota, parser, storage, or provider
change was made here.

Recheck database plan/usage and relation sizes through authenticated
read-only production access when available. Any maximum-size end-to-end probe
requires a separately approved disposable target and bounded synthetic data;
do not upload to live accounts, overwrite/delete real backups, or test restore
against live projects. Do not run production DDL from app startup, deployment
builds, or a custom migration script.

## Validation scope

`git diff --check` passed, and the local serializer/parser checks above passed
through backup validation and then reproduced the expected parser 413. The
`test-fast` tier was not run: it is only a candidate for this readiness draft,
with no admitted Unified ID or authorized tier, and its suites do not measure
production capacity or the published request ceiling. No production write,
maximum-size published request, or live-account backup operation was attempted.
