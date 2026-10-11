# Cloud project and reference-photo storage blocker

## Current behavior

CloudPainter continues to save the current sketch and reference-photo data in the
browser's local storage. Saved-sketch recovery snapshots are also browser-local.
Nothing is automatically copied to a Clerk account or uploaded when someone signs
in. Clearing browser site data, browser storage eviction, or moving to another
device can make those local copies unavailable. No server-side project/photo copy
exists to retain or delete.

## Why account storage was not enabled

The storage design requires verified project-size, per-account quota, database
capacity, and request-body ceilings before it can promise reliable writes. This
workspace has no published CloudPainter deployment or production database to
inspect. The development database measured approximately 7.5 MiB, but that does
not establish production headroom or deployment request limits. Replit's
documentation describes database capacity by plan but does not publish the
application request-body ceiling needed to validate bounded snapshot writes.

Therefore no project/photo database schema, upload endpoint, cloud sync, automatic
migration, or new object-storage service was added. Do not describe the current
app as providing cross-device project backup. Do not upload an existing local
project on sign-in; any future association flow must be an explicit, one-time user
choice and must preserve a recoverable local copy.

## Requirements before resuming

1. Verify the production database plan, available storage headroom, retention and
   deletion expectations, and migration process.
2. Obtain a documented hard request/body ceiling for the deployed API and prove
   that it accommodates the strictly bounded project/photo payload plus overhead.
3. If safe bounded atomic snapshots cannot fit those verified limits, choose and
   approve a durable private file-storage design with tenant-scoped authorization,
   quotas, deletion, and interrupted-upload recovery before implementing it.
4. Then implement cross-device project load/save, strict photo signature/type/
   dimension validation, revision conflicts, explicit local-project association,
   visible sync/retry state, and account-switch isolation with provider calls
   stubbed in all validation.
