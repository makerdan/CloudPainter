# Poe spending controls

## Approved policy

- Signed-in, explicitly approved Clerk accounts only. Signing up does not grant access.
- Normal accounts: 2 attempts per UTC calendar day. Admin accounts: 15.
- All accounts together: 20 attempts per UTC day and 5 per rolling ten minutes.
- At most 2 active generation leases, shared across server instances.
- The supplied account is initially approved as an admin by the idempotent setup script.
- These are **request budgets, not a guarantee of a specific number of Poe points**.
  Model prices can differ. No paid inference was needed for these checks.

## Storage and authorization

The existing `@workspace/db` PostgreSQL database stores application-owned membership
in `image_generation_accounts` and durable reservations in `image_generation_attempts`.
Clerk middleware verifies the session and derives the account ID. Browser fields,
Clerk user-editable metadata, and origin headers cannot grant membership or admin status.
The generator reuses the palette feature's Account provider and sign-out transition.

Membership and all limits are rechecked together in a transaction under a shared
PostgreSQL advisory lock before provider transport. Database errors deny generation.
No process-local billing counter is used. Reservations survive server restarts.
Success, failures, cancellation, and ambiguous timeouts all retain their consumed attempt;
only the active slot is released. A crashed worker's slot expires after 180 seconds,
longer than the provider's 120-second request deadline and media-download bound.
No model/provider substitution or automatic generation retry is enabled.

## Setup and account changes

For development, apply the existing schema with
`pnpm --filter @workspace/db push`, then run
`pnpm --filter @workspace/api-server setup:image-access`.
The post-merge script performs these operations too. The setup script uses
`ON CONFLICT DO NOTHING`: rerunning it never changes a current account's role.

Approve additional accounts only after owner authorization. In the appropriate
database, insert a verified Clerk user ID with `role = 'normal'` or `'admin'`.
Change a role by updating that row; revoke access by setting `enabled = false`.
Keep the disabled row so the idempotent initial setup cannot restore access
on a later merge. Never delete
attempts to refund a potentially transmitted request. Role changes within a day
reuse the same attempt history rather than resetting usage. Revocation prevents
new reservations but does not recall an already transmitted request.

Development and production Clerk accounts can have different IDs. Before public
sharing, apply the schema through the existing deployment process and explicitly
approve the intended production Clerk identity. Do not copy development palettes
or assume a production user will match a development ID. Missing tables or
unapproved production accounts fail closed. This task does not deploy the app.

## Regression checks

- `pnpm --filter @workspace/api-server test:image-access` — real PostgreSQL transactions
  in an isolated disposable schema; stub provider only. Covers anonymous/unapproved
  denial, role limits, account and global exhaustion, rolling bursts, parallel
  reservations, revocation, crash leases, fresh worker instances, midnight reset,
  database outage, config status, and no retries after ambiguous failure.
- `pnpm --filter @workspace/integrations-openai-ai-server test:poe` — unchanged four-model
  registry and provider-contract checks using fake credentials/stub transport.
- `pnpm run typecheck` — canonical workspace typecheck.
- `CLOUDPAINTER_TEST_URL=<running-preview> CLOUDPAINTER_AUTH_STATE=<signed-in-state-file>
  pnpm --filter @workspace/cloudpainter test:poe-images` — browser checks with mocked
  generation/config responses. Clerk sign-in is real; no Poe request is sent.
  Keep session-state files only in ignored `generated-artifacts/`, never commit them.
  The suite fails explicitly when its signed-in fixture is missing.

The browser covers signed-out drawing, sign-in gating, unapproved access, account
and shared exhaustion, exact model choices, explicit reference-image application,
sketch preservation on failure, and missing provider configuration. Mocked config
is UI test data, not an application authorization override.

## Verification results

The canonical workspace typecheck passed. All 18 spending-control tests, 17
Poe provider-contract tests, and the existing palette authorization test passed.
The running API returned 401 for anonymous generation.

A focused signed-in browser pass confirmed real unapproved-account rejection,
mocked preview/application, failure preservation, both quota gates, and clearing
previews on sign-out. The optional browser suite initially passed five checks
and exposed a timing issue from immediately reopening an exiting dialog in the
combined exhaustion test. Splitting it into independent cases produced two
passing targeted exhaustion checks. Every provider response in browser checks
was intercepted; no paid generation was performed.

During the final sync, overlapping integrations corrupted three existing
photo/layer test fixtures. These were restored from their intact intended cases,
and the deletion tests were updated to open the newly collapsed opacity control.
The photo/layer and image-generator browser checks were then exercised together;
any follow-up reruns covered only the repaired cases.
The combined run passed 15 of 17 cases; both remaining deletion cases passed
after opening the opacity disclosure. All 18 spending checks and the canonical
workspace typecheck also passed against the final integrated source.

### Manual approved-generation QA — 2026-10-10

- Route: CloudPainter `/` and API `/api/images/config`, `/api/images/generate`.
- Signed-out browser flow passed: drawing remained available, the generator showed
  the sign-in gate, submission was disabled, and the browser intercepted zero
  generation requests.
- The anonymous config response reported `signedIn: false` and `allowed: false`.
  A direct generation POST returned HTTP 401 with `Sign in to generate images.`
- The 18 spending-control tests and 17 Poe provider-contract tests passed; these
  use stubbed provider transport and made no live Poe request.
- No owner-approved test identity or request-specific point-spending approval was
  provided. Therefore no live generation was authorized or completed. The approved
  account preview-and-apply journey was not manually exercised in this run.
- The sketch-preservation requirement did not pass source/test inspection: selecting
  “Use image as reference” replaces the current project with a new one-layer project
  (`App.tsx` and `ImageGenerator.test.tsx`), and the dialog warns that existing
  photo/drawing layers will be replaced. This behavior was not changed because
  changing image-generation behavior is out of scope for this verification task.
- No account identifiers or prompts were recorded.
