# Resource and recovery coverage review

**Reviewed:** 2026-10-14
**Method:** Read-only review of repository configuration and source, secret-existence
metadata only, and Replit's published platform documentation. Secret values were
not accessed or recorded. No restore, overwrite, deletion, or live-resource
recovery test was performed.

## Remix record

- **Status:** Owner-confirmed. The owner said this project has become the Remix.
  Available project metadata does not independently prove the Remix relationship.
- **Current project identifier:** `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`
  (runtime `REPL_ID`; no Remix share URL was available to inspect).
- **Source revision recorded before the owner's confirmation:**
  `817e478a886a46ff919d9ff1c681e3d78324406f`, branch `main`, clean worktree.
- **Current revision observed afterward:**
  `4615c10a57e25d7724c94f7bf8fb7d762b84d513`, branch `main`, clean worktree.
  The earlier revision is an ancestor of the current revision, but the exact
  revision copied at Remix creation cannot be independently established.
- Replit documentation describes Remix file/configuration and checkpoint-history
  copying, but this project did not expose independent evidence of the creation
  event or a parent-to-Remix link. Treat the backup as owner-confirmed, not
  agent-verified.
- **Documented Remix scope, not verified against this instance:** files,
  configuration, and checkpoint file history are copied. The database is fresh
  unless the owner selects the optional source-data copy; that selection is
  unknown. Deployments, domains, and connector configurations are omitted.
  Secret names are copied; values copy only when an owner remixes their own app,
  and that ownership-specific result is unknown here. Replit says uploaded files
  and App Storage objects are copied, but this app has no persistent upload or
  App Storage use; browser-local sketches are not project files. Provider-side
  accounts and data are not established as copied.
- Remix documentation: [Remix an app](https://docs.replit.com/features/projects-and-artifacts/remix-an-app).

## Summary

This project has source-control recovery and documented managed-PostgreSQL
recovery options, but neither protects CloudPainter projects saved only in an
individual browser. Projects remain local by default; explicit account backups
are now available through the API. Replit's App Storage is not used. Production
database/deployment readiness, actual database recovery configuration, recent
backup status, secret validity/recoverability, and external-provider recovery
policies remain unknown. The owner's confirmation that this project is the
Remix does not establish which optional data-copy choices were selected or
prove that every resource was copied.
## Coverage inventory

| Resource | Verified coverage | Unknown or uncovered |
| --- | --- | --- |
| **Repository and source** | The working tree was clean on branch `main`; two Git remotes are configured, including Replit's documented `gitsafe-backup` remote. Replit documentation says Git disaster recovery backs up commit history, including checkpoints and manual commits. | Remote reachability, last successful backup time, retention, branch protection, and recovery-point objectives were not checked. Git disaster recovery excludes uncommitted working-tree changes. A clean `git status` does not establish that ignored local files are backed up. |
| **Development database** | Source defines PostgreSQL-backed account palettes, image-generation access/attempts, admin records/audit events, and settings. A metadata-only query measured the development database at 7,926,243 bytes (about 7.56 MiB). Replit documentation describes daily scheduled backups and point-in-time recovery for managed PostgreSQL. | The applicable account plan, retention setting, latest successful snapshot, available point-in-time window, and a successful restore are unverified. Checkpoints only include the development database when explicitly selected for rollback. |
| **Production database** | A metadata-only production database query confirmed that no production database exists for this Repl. Replit documentation says production databases are not restored automatically by project rollback. | Production plan, storage headroom, backup status, retention, restore permissions, and recovery procedure cannot be checked until a production database exists. No production user data was queried. |
| **Uploads and project files** | Photo import, drawing, autosave, and Saved sketches remain browser-local. The app retains manual export/import capped at 2 MiB, and signed-in users can explicitly create, list, restore, or delete immutable account snapshots in PostgreSQL. API requests are scoped to the authenticated Clerk user; create is idempotent and capped at 2 MiB, with 20 snapshots/32 MiB per account and 128 MiB total payload. The API parser limit is 2 MiB plus 128 KiB. | Sign-in alone does not upload a project, and no existing local project is migrated. Loss of browser data still loses any project not explicitly backed up. No published CloudPainter API deployment or production database exists to verify production plan/headroom or the upstream request-size ceiling. |
| **Object storage** | No Replit App Storage integration or persistent upload service is present in the reviewed project configuration/routes. | There is no configured object bucket to include in this project's recovery coverage. Replit's documentation says App Storage does not provide object versioning or retention policies; if added later, its deletion/recovery design must be handled separately. |
| **Configuration** | `.replit`, artifact service definitions, package manifests/lockfile, and GitHub workflow definitions are tracked in the repository. | Live deployment settings, environment-specific overrides, account/workspace settings, branch protection, and the deployed revision were not inspected. They should not be assumed to be restored by Git or an Agent checkpoint. The project `.gitignore` has no explicit `.env`/`.env.*` rule; this runtime's global ignore currently matches `.env`, but that rule is not portable with the repository. No dotenv file was found in the inspected project tree. |
| **Secrets** | Secret-existence metadata reported these names present in both development and production: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `POE_API_KEY`, `SESSION_SECRET`, and `VITE_CLERK_PUBLISHABLE_KEY`. Replit documentation says secrets are stored separately from Git and Agent checkpoints. | Presence does not prove a secret is current, valid, correctly scoped, or usable by the deployed service. Rotation history, owners, expiry, recovery/export path, and production linkage were not verified. `SESSION_SECRET` has no source reference in the reviewed repository; whether it is still needed is unknown. Secret values were not read. |
| **External resources and providers** | Source/configuration identifies Clerk for sign-in, Poe for image generation/upscale/hosted outlining/logo generation, the Poe media CDN, Hugging Face for local model assets, Google Fonts, GitHub Actions, and package registries. | Their account-level backup, retention, outage recovery, billing/quotas, and provider-side deletion behavior are outside repository and Replit database backups and were not inspected. Poe-hosted requests may be retained by Poe or downstream providers; the exact bot/API retention policy was not verified. |

## Evidence and interpretation

- Repository status, remotes, ignore rules, tracked workflow and artifact
  configuration, database schemas, and application storage behavior were
  inspected locally. Development database size was queried as metadata only.
  Remote contents and remote backup freshness were not fetched.
- Project-backup API behavior was tested against an in-memory route store. The
  PostgreSQL store was tested in temporary disposable schemas that were dropped
  afterward; no live account/project rows were read or changed.
- Secret checks used existence metadata only in development and production.
  Values, fingerprints, and connection strings were not read or printed.
- Replit platform documentation consulted:
  - [Data recovery](https://docs.replit.com/features/data-and-storage/data-recovery)
  - [Git disaster recovery](https://docs.replit.com/features/version-control/disaster-recovery)
  - [Checkpoints and rollbacks](https://docs.replit.com/features/version-control/checkpoints-and-rollbacks)
  - [App Storage](https://docs.replit.com/features/data-and-storage/object-storage)
  - [Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
- The documentation describes platform capabilities, not this project's current
  account plan, configured retention, backup completion, or a successful restore.
  Database retention is plan-dependent (up to 7 days on Core and up to 28 days
  on Pro/Enterprise, according to the retrieved documentation); the project's
  applicable plan and setting are unknown.
- No recovery action was initiated because validating recovery by replacing or
  deleting live data would exceed the requested safe scope.

## Safe follow-up evidence needed

To close the unknowns without disturbing live resources, an authorized owner can
review the repository's backup remote status, database settings/backup history,
deployment configuration, secret ownership and rotation records, and external
provider retention policies. Any actual restore exercise should use an isolated
disposable target and an approved recovery procedure, never an overwrite of the
live resource.
