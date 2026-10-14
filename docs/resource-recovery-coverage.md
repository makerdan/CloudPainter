# Resource and recovery coverage review

**Reviewed:** 2026-10-13  
**Method:** Read-only review of repository configuration and source, secret-existence
metadata only, and Replit's published platform documentation. Secret values were
not accessed or recorded. No restore, overwrite, deletion, or live-resource
recovery test was performed.

## Summary

This project has source-control recovery and documented managed-PostgreSQL
recovery options, but these do not protect CloudPainter projects saved in an
individual browser. Replit's App Storage is not used. The actual database
recovery configuration, recent backup status, secret validity/recoverability,
deployment settings, and external-provider recovery policies remain unknown.

## Coverage inventory

| Resource | Verified coverage | Unknown or uncovered |
| --- | --- | --- |
| **Repository and source** | The working tree was clean on branch `main`; two Git remotes are configured, including Replit's documented `gitsafe-backup` remote. Replit documentation says Git disaster recovery backs up commit history, including checkpoints and manual commits. | Remote reachability, last successful backup time, retention, branch protection, and recovery-point objectives were not checked. Git disaster recovery excludes uncommitted working-tree changes. A clean `git status` does not establish that ignored local files are backed up. |
| **Development database** | Source defines PostgreSQL-backed account palettes, image-generation access/attempts, admin records/audit events, and settings. Replit documentation describes daily scheduled backups and point-in-time recovery for managed PostgreSQL. | The configured database identity, plan, retention setting, latest successful snapshot, available point-in-time window, and a successful restore are unverified. Checkpoints only include the development database when explicitly selected for rollback. |
| **Production database** | Replit documentation says production databases are not restored automatically by project rollback. | Whether a production database is currently attached to a published deployment, its backup status, retention, restore permissions, and recovery procedure are unknown. No production data was queried. |
| **Uploads and project files** | Photo import, drawing, autosave, and saved-sketch history are browser-local. The app has a manual project export/import format capped at 2 MiB. The PostgreSQL schema does not contain project or photo payloads. | Browser-local storage is not covered by repository or database recovery. No automatic cloud copy, cross-device project sync, or server-side upload archive is configured. Loss of browser/site data or the device can lose these projects. A manual export is not proof of a backup until the user stores it separately. |
| **Object storage** | No Replit App Storage integration or persistent upload service is present in the reviewed project configuration/routes. | There is no configured object bucket to include in this project's recovery coverage. Replit's documentation says App Storage does not provide object versioning or retention policies; if added later, its deletion/recovery design must be handled separately. |
| **Configuration** | `.replit`, artifact service definitions, package manifests/lockfile, and GitHub workflow definitions are tracked in the repository. | Live deployment settings, environment-specific overrides, account/workspace settings, branch protection, and the deployed revision were not inspected. They should not be assumed to be restored by Git or an Agent checkpoint. The project `.gitignore` has no explicit `.env`/`.env.*` rule; this runtime's global ignore currently matches `.env`, but that rule is not portable with the repository. No dotenv file was found in the inspected project tree. |
| **Secrets** | Secret-existence metadata reported these names present in both development and production: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `POE_API_KEY`, `SESSION_SECRET`, and `VITE_CLERK_PUBLISHABLE_KEY`. Replit documentation says secrets are stored separately from Git and Agent checkpoints. | Presence does not prove a secret is current, valid, correctly scoped, or usable by the deployed service. Rotation history, owners, expiry, recovery/export path, and production linkage were not verified. `SESSION_SECRET` has no source reference in the reviewed repository; whether it is still needed is unknown. Secret values were not read. |
| **External resources and providers** | Source/configuration identifies Clerk for sign-in, Poe for image generation/upscale/hosted outlining/logo generation, the Poe media CDN, Hugging Face for local model assets, Google Fonts, GitHub Actions, and package registries. | Their account-level backup, retention, outage recovery, billing/quotas, and provider-side deletion behavior are outside repository and Replit database backups and were not inspected. Poe-hosted requests may be retained by Poe or downstream providers; the exact bot/API retention policy was not verified. |

## Evidence and interpretation

- Repository status, remotes, ignore rules, tracked workflow and artifact
  configuration, database schemas, and application storage behavior were
  inspected locally. Remote contents and remote backup freshness were not fetched.
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
