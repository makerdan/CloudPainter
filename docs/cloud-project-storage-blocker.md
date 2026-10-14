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

## Capacity and deployment evidence

The storage design uses the existing PostgreSQL service rather than object
storage because the application accepts only 2 MiB project snapshots and
enforces strict per-account and service-wide payload quotas. Replit's published
database documentation lists production capacity starting at 1 GiB on Starter
and up to 100 GiB on paid plans. A metadata-only query measured the development
database at 7,926,243 bytes (about 7.56 MiB) before this feature's schema was
added.

There is no production database provisioned for this Repl and no published
CloudPainter API deployment to inspect. Therefore its actual production plan,
current production headroom, and upstream published request-size ceiling remain
unverified. Replit documentation does not publish a global request-body limit
for published apps. The API now independently caps an individual backup at
2 MiB and its JSON request parser at 2 MiB plus 128 KiB of envelope overhead.
That application limit does not prove that an unobserved upstream proxy will
accept the same request size.

The Drizzle schema is the source of truth. The existing post-merge setup applies
it to development; Replit's managed Publish flow applies the schema diff to
production after the user reviews it. Do not run production DDL from app startup,
deployment builds, or a custom migration script. Until a production database
and API deployment are available and verified, do not claim that production
cross-device recovery is operational.

## Production readiness still required

1. Provision or confirm the production PostgreSQL database; verify its plan,
   available storage, backup/retention policy, and migration process.
2. Verify the real published API request ceiling accommodates the bounded 2 MiB
   backup plus JSON overhead; if it does not, change the request design only
   after authorizing a private object-storage solution with quotas, deletion,
   and interrupted-upload recovery.
3. Apply the project-backups schema in production, then validate with
   disposable accounts/resources and stubbed provider calls. Never test restore
   against live user projects.
