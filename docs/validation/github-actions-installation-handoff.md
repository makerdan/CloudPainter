# GitHub Actions installation handoff

## Scope and evidence

This handoff records repository-file changes only. No remote workflow was
triggered or rerun, no push was made, and no repository setting, secret,
environment, ruleset, or branch policy was changed.

Implementation-time baseline:

- Local revision: `a87fc2491a571f810ed58ce9e1cb9aaeeef68d6e`.
- Local branch: `main`; worktree was clean before these changes.
- Local `main` was five commits ahead of `origin/main` and zero behind.
- Read-only GitHub API evidence: `makerdan/CloudPainter` is public, with
  default branch `main`; the remote `main` SHA was
  `e0ee3b3c38b5765c32887b543473d40532550250`.
- GitHub API showed zero existing Actions workflows and zero workflow runs.
- Branch-protection evidence is unavailable: the unauthenticated read returned
  HTTP 401. Ruleset and required-check configuration are therefore unknown.
- Node was `v24.13.0`; pnpm was `10.26.1`. `.replit` declares Node 24; there is
  no repository `.node-version`, `.nvmrc`, or `packageManager` declaration.
  The workflow pins the observed exact tool versions to make its runner setup
  reproducible.

GitHub Actions is **not verified active, passing, or required**. This checkout
has not been pushed, and there is no remote run evidence for the new workflow.

## Post-rebase source inventory

The task branch was rebased onto the current local `main-repl/main` after the
initial implementation. The resulting source revision is
`13ac13805b37fef2d5297fabcce4638e6af77f4d`; the worktree was clean immediately
after the rebase. A later read-only fetch updated `origin/main` from
`e0ee3b3c38b5765c32887b543473d40532550250` to
`ea27d9de3c581412ec132e95ed754fe4e2d6463a`; the local source contains that
current remote revision and is six commits ahead, zero behind. No push or
remote workflow run followed. A final public GitHub API read still reported
default branch `main`, zero Actions workflows, and zero workflow runs. This
rebase brought in new clipboard tests, an on-device outline-model browser
regression, and repairs to image-generator browser fixtures; those are included
in the updated coverage and post-rebase validation below.

The rebased source also contains `.github/workflows/daily-readme-sync.yml`, an
independent README-maintenance workflow from the incoming mainline. This task
did not add or modify it. It has a scheduled trigger and write permission, but
it is not a validation workflow and is not part of the CI workflow or its
permission boundary described here. The new CloudPainter CI workflow itself
still has only pull-request and `main`-push triggers.


## Aggregate CLI regression evidence (2026-10-11)

The owner authorized a task-scoped local run with Failure Gate inactive for
this operation only. Ran only `node --test --test-timeout=10000
--test-concurrency=1 scripts/ci/check-required-results.test.mjs`: exit 0,
32/32 tests passed, no skips or cancellations, about 1.1 seconds elapsed.
An independent Python monotonic supervisor enforced a 60-second execution
deadline, a 10-second cleanup allowance and a 64-KiB captured-output limit.
Every test has a 10-second limit; each actual CLI child has a 5-second timeout,
SIGKILL on timeout and a 64-KiB output limit. There are no test hooks.

CLI fixtures inherit no environment variables and use only synthetic
`NEEDS_CONTEXT` values. They verify normal zero exits with exact success
output, and normal exit 1 with failure diagnostics for invalid/missing JSON,
non-object context, empty/duplicate required-job lists, unsuccessful results,
and missing jobs/results after another job succeeds. A killed or failed-to-start
child cannot satisfy a negative test.

The checker, test file and workflow hashes were unchanged during the run;
the owned process group was empty afterward. Local logs and snapshot hashes
are in the ignored `generated-artifacts/aggregate-cli-validation/` directory.
The existing workflow already directly selects this suite, so these portable
cases receive configured remote coverage without another workflow or command.
Checker behavior, workflow and merge rules remain unchanged. No remote run
was initiated or inspected; current remote passing/required status remains
unknown. This result is not Failure Gate activation or a full CI pass.

## Changed files

- `.github/workflows/cloudpainter-ci.yml` — PR and `main` push workflow,
  one validation job, ephemeral PostgreSQL service, and stable `ci-required`
  aggregate.
- `scripts/ci/check-required-results.mjs` — fails unless every named required
  job reports exactly `success`.
- `scripts/ci/check-required-results.test.mjs` — direct regression checks for
  failure, skipped, cancelled, timed-out, unknown, missing, and successful job
  results.
- `docs/validation/github-actions-installation-handoff.md` — this inventory,
  boundary record, evidence, and handoff.
- `.agents/memory/MEMORY.md` and `.agents/memory/nix-disposable-postgres.md` —
  durable note on using a temporary Unix-socket directory for disposable
  PostgreSQL on this Nix host.

Third-party action pins were checked against the corresponding GitHub tag
commits through the read-only GitHub API:

- `actions/checkout` v4.2.2:
  `11bd71901bbe5b1630ceea73d27597364c9af683`.
- `actions/setup-node` v4.4.0:
  `49933ea5288caeca8642d1e84afbd3f7d6820020`.
- `pnpm/action-setup` v4.1.0:
  `a7487c7e89a18df4991f7f222e4898a00d66ddda`.

## Local-to-remote coverage

The workflow runs on every pull request and every push to `main`; it has no
path filters. Both jobs use `ubuntu-24.04` and Node `24.13.0`. The validation
job uses pnpm `10.26.1`, installs with `pnpm install --frozen-lockfile`, and has
a 45-minute timeout. The aggregate job has a five-minute timeout.

| Local validation surface / exact command | CI coverage and decision |
| --- | --- |
| `pnpm --filter @workspace/api-spec run codegen` | Included before compilation. Then `git diff --exit-code -- lib/api-client-react/src/generated lib/api-zod/src/generated` and an untracked-file check fail if generated outputs are stale or newly emitted. |
| `pnpm run build` with `PORT=4173 BASE_PATH=/` | Included; this root command runs `pnpm run typecheck` and all package builds. Covers `artifacts/api-server`, `artifacts/cloudpainter`, and `artifacts/mockup-sandbox` build/typecheck scripts, plus the workspace TypeScript project build. |
| `node --test scripts/ci/check-required-results.test.mjs` | Included; tests both the exported classifier and actual CLI exits, JSON parsing, required-job argument validation, and fail-closed results with synthetic environments. |
| `node --test scripts/ci/api-test-coverage.test.mjs` | Included in the existing validation job; asserts the exact step-scoped disposable database URL before running local command stubs, rejects shared/secret-backed URL substitutions, checks effective image-access/palettes/settings selection, rejects a comment-only settings mention, and preserves nonzero suite results. No database, live auth, provider, or real package command is used by this guard. |
| `pnpm run test:regression-guard` | Included; tests the regression-guard checker and local task-plan runner using temporary fixtures. |
| `pnpm --filter @workspace/api-server run test:outline` | Included; local Express tests use fixtures and stubbed provider dependencies. |
| `pnpm --filter @workspace/api-server run test:image-upscale` | Included; provider transport is stubbed; no paid request. |
| `pnpm --filter @workspace/api-server run test:logo-api` | Included; provider transport is stubbed; no paid request. |
| `pnpm --filter @workspace/integrations-openai-ai-server run test:poe` | Included; mocked provider/model/error/media tests; no paid inference. |
| `pnpm --filter @workspace/cloudpainter run test:image-dimensions` | Included; local fixture/unit test. |
| `pnpm --filter @workspace/cloudpainter run test:outline` | Included; local outline/privacy tests. |
| `pnpm --filter @workspace/cloudpainter run test:outline-ui` | Included; Vitest/jsdom UI tests. |
| `pnpm --filter @workspace/cloudpainter run test:stroke-renderer` | Included; deterministic local rendering tests. |
| `pnpm --filter @workspace/cloudpainter run test:layer-clipboard` | Included; local immutable-copy, paste, undo/redo and invalid-destination tests. |
| `pnpm --filter @workspace/cloudpainter run test:drawing-tools` | Included; local drawing-tool tests. |
| `pnpm --filter @workspace/cloudpainter run test:drawing-colors` | Included; local color tests. |
| `pnpm --filter @workspace/cloudpainter run test:palettes` | Included; browser-side palette persistence/session tests. |
| `pnpm --filter @workspace/cloudpainter run test:logo-ui` | Included; Vitest/jsdom with mocked UI requests. |
| `pnpm --filter @workspace/cloudpainter run test:upscale-ui` | Included; Vitest/jsdom with mocked provider responses. |
| `pnpm --filter @workspace/api-server run test:image-access` | Included with disposable PostgreSQL 16.10 service and a test-only `DATABASE_URL`; service health uses `pg_isready`. Test creates and removes a unique schema. |
| `pnpm --filter @workspace/api-server run test:palettes` | Included with the same disposable PostgreSQL service; the test creates a unique schema inside a transaction and rolls it back. |
| `pnpm --filter @workspace/api-server run test:settings` | Included with the same disposable PostgreSQL 16.10 service and step-scoped test-only `DATABASE_URL`. The suite creates a unique schema and fixture table inside a transaction, rolls it back, and closes its local HTTP server and database pool. Synthetic subjects and locally generated offline Clerk signing keys verify auth without genuine Clerk identities, linked/shared databases, provider credentials, paid inference, or schema migrations. |
| `pnpm --filter @workspace/cloudpainter run test:instruments-browser` | Included against the CI-started Vite server and installed Chromium. This config includes both `DrawingTools.test.tsx` and `BrushStyles.test.tsx`. |
| `pnpm --filter @workspace/cloudpainter run test:brushes-browser` | Consolidated duplicate: its `BrushStyles.test.tsx` selector is already covered by `test:instruments-browser`; it is not run a second time. |
| `pnpm --filter @workspace/cloudpainter run test:drawing-colors-browser` | Included against the same local server with isolated browser fixture/account transport. |
| `pnpm --filter @workspace/cloudpainter run test:keyboard-shortcuts` | Included against the same local server; no account state is loaded. |
| `pnpm --filter @workspace/cloudpainter run test:photo-export` | Included; test starts its own local Vite server on a dynamically selected port, waits for readiness, and closes it. |
| `pnpm --filter @workspace/cloudpainter run test:logo-browser` | Included against the same local server; generated images/API responses use local test fixtures. |
| `pnpm --filter @workspace/cloudpainter run test:clipboard-browser` | Included against the isolated CI server; local-storage fixtures and browser contexts, no account state. |
| `pnpm --filter @workspace/cloudpainter run test:outline-model-browser` | Included; starts and tears down its own local server, runs the locked local inference library in Chromium, and checks public dog/cat fixtures. It fetches public Wikimedia photos and public Hugging Face model assets with bounded timeouts; it makes no hosted inference or paid request. |
| `pnpm --filter @workspace/cloudpainter run test:tooltips` | Included against the same local server; no authentication state is supplied. |
| `pnpm --filter @workspace/cloudpainter run test:anonymous-photo-and-images` | Included against the same isolated server. Covers account-free `App`, photo-card, and image-generator cases; excludes the explicitly named signed-in generation group. CI clears `CLOUDPAINTER_AUTH_STATE`; image API responses are local route stubs, with no credentials or paid Poe request. |
| `pnpm --filter @workspace/cloudpainter run test:photo-card` | The full suite is not run because it includes signed-in generation cases requiring an authorized Clerk storage-state fixture. Its account-free cases are covered by `test:anonymous-photo-and-images`. |
| `pnpm --filter @workspace/cloudpainter run test:poe-images` | The full suite is not run because it includes signed-in generation cases requiring authorized Clerk state. Its account-free cases are covered by `test:anonymous-photo-and-images`; provider requests remain locally stubbed. |
| `pnpm run validate:task-plans` | Not applicable to a GitHub checkout: its input `.local/tasks/` is workspace-local and no task-plan files are tracked. The wrapper also has an intentional `--fix-stub` write phase; the portable `test:regression-guard` contract suite is included instead. |
| `node scripts/check-regression-guard.mjs` | Not applicable in a GitHub checkout for the same reason: without tracked `.local/tasks/`, the checker has no task plans to inspect and reports an empty inventory. |
| `pnpm --filter @workspace/api-server run setup:image-access` | Excluded: initializes database state; no setup/migration command is run in CI. The isolated tests own their test schemas. |
| `pnpm --filter @workspace/cloudpainter run verify:outline-fixtures` | Not run: it reads generated provider-probe PNGs in ignored `generated-artifacts/`; those are not tracked, portable fixtures. |
| `pnpm --filter @workspace/api-server run verify:logo-live` | Excluded: makes a live paid Poe request and depends on a credential. |
| `pnpm --filter @workspace/db run push` / `push-force` | Excluded: applies schema changes to a configured database. CI must not migrate shared or production state. |
| `scripts/post-merge.sh` | Excluded: runs database schema push and image-access setup; this is a local post-merge operational flow, not validation. |
| `python3 artifacts/cloudpainter/tests/run-instrument-checks.py ...` | The wrapper is local-only: it binds checks to an owner-authorized, task-local time budget and existing Replit preview. Its portable instrument suite is run directly against CI's isolated server instead. |
| `pnpm --filter @workspace/cloudpainter run dev` | Used only to start the isolated browser-test server, with explicit port/base path and HTTP readiness polling; a shell trap tears down its process group. |
| Package scripts named `dev`, `serve`, `start`, `preview`, `hello`; package `push` scripts | Not validation suites. Root typecheck/build covers the package build targets; no app deployment/startup, secret-backed operation, or schema push is invoked. |

Formatting/linting, explicit coverage thresholds, mutation/performance,
dependency-policy/security scan, accessibility-specific scanner, native-device
test, docs generation, and deploy/release checks have no canonical workspace
script/configuration found in the inspected package manifests and validation
documents. They are recorded as **not configured**, not as passing. The current
browser suites do not establish full accessibility coverage.

## Settings API coverage update

The executable database loop now selects `test:image-access`, `test:palettes`,
and `test:settings` in the existing `validation` job. All three receive the
same disposable service URL; no shared connection or setup/migration command
was added. A failing suite still sets the existing accumulated failure flag,
and the step exits nonzero after running its siblings. The unchanged
`ci-required` job rejects a non-successful `validation` result.

The frontend SettingsPage tests already run indirectly through
`pnpm --filter @workspace/cloudpainter run test:logo-ui`; this update does not
duplicate that coverage. It adds the previously omitted server-side persistence
suite and a portable executable-selection guard, not a new workflow or a
generic test-discovery framework.

Local checks on 2026-10-11:

| Exact executed command | Raw result |
| --- | --- |
| `node --test scripts/ci/api-test-coverage.test.mjs` | Exit 0; 7/7 passed. The actual database shell block ran with a stubbed `pnpm`, recording all three exact API commands. Injecting exit 23 from settings produced stage exit 1; removing settings despite a shell comment, and replacing the database exit with success, were both rejected. Image-access and palette failures also produced stage exit 1 without omitting siblings. |
| `node --test --test-timeout=10000 scripts/ci/check-required-results.test.mjs` | Exit 0; 8/8 passed. The timeout is a task-local supervision narrowing; the canonical local and CI aggregate command is unchanged. |
| `pnpm --filter @workspace/api-server run test:settings` | Exit 0; 1/1 passed against a freshly initialized disposable PostgreSQL 16.10 cluster, with TCP disabled and a private temporary Unix socket. Used only synthetic subjects and the suite's offline signing keys. PostgreSQL shutdown succeeded, the fixture directory was removed, and no owned descendant remained. |
| `python3 generated-artifacts/settings-ci-validation/structure.py` | Exit 0. The available `yq -o=json` parsed the workflow; structural comparison against the pre-edit source proved only the guard step and settings selection changed. All shell `run` blocks passed `bash -n`, both new matrix rows were present, and `git diff --check` passed. |

The owner explicitly authorized these task-scoped checks with Failure Gate
inactive for this operation only. An independent Python monotonic supervisor
bounded each launch, including startup and cleanup, below five minutes and
enforced a shared fifteen-minute deadline. Effective execution caps were
30 seconds for each guard/structural check and 180 seconds for the settings
fixture, with at most 20 seconds of owned-process cleanup and bounded log
capture. Guard tests have explicit ten-second limits and five-second child-shell
limits; the aggregate used a ten-second runner limit; the existing settings
test has a sixty-second limit and no separate hooks. Logs were capped at
1 MB per command. Total supervised elapsed time was about five seconds;
all four raw statuses were zero and owned-process termination was verified.
These are cooperative local results, not Failure Gate activation or evidence
of a passing full CI pipeline. No full build, root typecheck or browser sweep
was required or run, and no scoped check remains incomplete.

Current read-only repository visibility evidence confirms a public repository
with default branch `main`. **Current GitHub workflow activation, passing runs,
and required-check/branch-policy status remain unknown.** No Actions run or
policy was inspected or changed for this update; there was no remote trigger,
dispatch, rerun, push, deployment, secret/environment change, or branch-rule
change. The earlier installation/run observations below are historical and
must not be read as current remote evidence.

## Disposable database target regression fixtures

The portable API coverage guard now checks the existing database step's exact
`env` stanza against the disposable PostgreSQL service URL before creating or
executing its command stubs. Narrow in-memory workflow fixtures replace only
that step's URL with either a synthetic shared host (`shared-db.invalid`) or
the literal GitHub expression `${{ secrets.DATABASE_URL }}`; both must be
rejected by the connection-boundary assertion. The unchanged workflow remains
the positive control and still selects all three suites. These checks inspect
text only: they do not resolve a secret, connect to PostgreSQL, or run pnpm.
They deliberately support the current step shape, not generic YAML discovery.
They do not claim to detect arbitrary shell-level connection overrides.

The check remains directly covered by the existing PR/`main`-push validation
job; no additional workflow or duplicated command was introduced. The service,
suite commands, action pins, permissions, and workflow file were not changed.
Remote activation, passing status, and merge requirements remain unknown;
no remote action was taken.

On 2026-10-11, the owner explicitly authorized one task-scoped local launch of
`node --test scripts/ci/api-test-coverage.test.mjs`. No active checked validation
route was verified and no project-wide governance activation is claimed.
An independent Python monotonic supervisor applied a 30-second execution cap,
10-second cleanup allowance, and 1 MiB combined-output cap to a private process
group. The existing tests retain 10-second per-test limits and 5-second shell
child limits; there are no hooks. Output and source digests were recorded under
the ignored `generated-artifacts/ci-database-boundary/` directory.
The single launch exited **0**, with **9/9 tests passing**, none cancelled or
skipped, in about **0.16 seconds**. The owned process group was confirmed gone.
No database, browser, build, provider, or real package test was launched.
This is focused local fixture evidence, not a passing full CI pipeline.

## Event scopes and security

- Events: `pull_request` and `push` limited to `main`.
- Not configured by `.github/workflows/cloudpainter-ci.yml`: `merge_group`,
  schedule, manual dispatch, deployment, release, or `pull_request_target`.
  The independent incoming README-maintenance workflow is documented above and
  was not modified by this task.
- No path filters or event-conditional test exclusions; per-suite exclusions
  and their reasons are listed in the coverage matrix below.
- Workflow permissions: `contents: read`; the aggregate job repeats that
  restriction. No write token, secret, deployment environment, or production
  credential is configured.
- The PostgreSQL password and `DATABASE_URL` are disposable, non-secret test
  values. `DATABASE_URL` is scoped to the database-test step. Browser checks
  use a fabricated non-secret publishable key, with no secret key, genuine
  account, session, or storage-state file. Test-only route/module stubs provide
  fixture identity where a case needs it; browser tests do not sign in.
- PostgreSQL is an ephemeral service container pinned to `postgres:16.10-bookworm`.
  Health is checked with `pg_isready` before steps execute; test schemas are
  isolated and cleaned up by their owning test.
- Chromium is installed from the lockfile-pinned Playwright package using
  `playwright install --with-deps chromium`.
- No matrix is used. The aggregate's `if: always()` is only used to inspect
  `needs`; `check-required-results.mjs` accepts only `success` for each
  explicitly named required job. Failure, skipped, cancelled, timed-out,
  unknown, missing, or malformed results return nonzero. If workflow-level
  cancellation prevents the aggregate from running, there is no successful
  aggregate result.
- No cross-run concurrency cancellation is configured. There are no retries or
  `continue-on-error` jobs. Browser test retries remain zero per their configs.
- Independent suites run to completion after sibling test failures, then the
  validation step exits nonzero if any failed. This preserves failure status
  while making all included portable results visible.

## Exclusions, gaps, and duplicate decisions

- Signed-in image-generator scenarios remain outside CI because they require
  authorized Clerk storage state. They are isolated in the
  `signed-in generation (provider always stubbed; requires authorized state)`
  group; the account-independent group uses local config/generation API stubs.
  Photo-card and other account-free image-generator cases run through the
  dedicated `test:anonymous-photo-and-images` command, which clears
  `CLOUDPAINTER_AUTH_STATE` in CI.
- The on-device outline browser test depends on publicly hosted fixture and
  model assets. Their network availability and upstream contents are outside
  this repository's lockfile; the test fails closed if they are unavailable or
  no longer produce the expected local labels.
- Live Poe checks, generated live-provider photo fixtures, schema migration and
  account setup flows remain excluded for cost, credential, privacy, or
  destructive-state reasons.
- No formatting, lint, audit, SAST, coverage, or policy scanner command is
  currently configured; these are not represented as successful checks.
- Before the rebase, photo export (11/13) and tooltips (3/4) had local failures,
  and `ImageGenerator.test.tsx` failed collection. Those results are historical,
  not current waivers: incoming source repaired the image-generator fixtures
  and changed browser tests. See the post-rebase validation results below.
- No prior remote CI provider/workflow/run was found through the inspected
  repository files and public GitHub API. This is an observed inventory only;
  branch-protection/ruleset state remains unknown because the API response
  required authentication.
- Required-check policy is a manual GitHub action and is not changed here.
  `ci-required` is a stable required-check **candidate**, not a currently
  required check.

## Validation results

The validated source baseline is `13ac13805b37fef2d5297fabcce4638e6af77f4d`.
The current `origin/main` (`ea27d9de3c581412ec132e95ed754fe4e2d6463a`) is its
ancestor; local `HEAD` is six commits ahead. The worktree was clean immediately
after rebase. The CI workflow and this handoff are the two tracked files changed
for the post-rebase update; generated build/test artifacts are ignored.

- `pnpm install --frozen-lockfile` — passed on Node `v24.13.0` and pnpm
  `10.26.1`; the lockfile remained unchanged. pnpm reported the workspace's
  existing ignored third-party build scripts.
- `pnpm --filter @workspace/api-spec run codegen`,
  `pnpm -w run typecheck:libs`,
  `git diff --exit-code -- lib/api-client-react/src/generated lib/api-zod/src/generated`,
  and the generated-file untracked check — passed; generated API outputs were
  already current.
- `PORT=4173 BASE_PATH=/ pnpm run build` — passed, including root and package
  typechecks/builds. Vite emitted its large-chunk warning; the build succeeded.
- `node --test scripts/ci/check-required-results.test.mjs` — 8/8 passed.
  Direct `NEEDS_CONTEXT` probes returned zero only for `success`; `failure`,
  `skipped`, and `cancelled` each returned nonzero.
- `pnpm run test:regression-guard` — 12/12 passed. The 14 included API,
  CloudPainter, and mocked-provider unit suites all passed (151 tests total):
  API outline 8, upscale 8, logo 15, Poe adapter 17; CloudPainter dimensions 5,
  outline 8, outline UI 6, stroke renderer 11, layer clipboard 6, drawing
  tools 8, drawing colors 3, palettes 5, logo UI 33, and upscale UI 18.
- Database commands
  `pnpm --filter @workspace/api-server run test:image-access` and
  `pnpm --filter @workspace/api-server run test:palettes` passed 18/18 and
  1/1. They used a new disposable PostgreSQL 16.10 cluster initialized with
  `/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin/initdb`,
  a temporary socket directory, a `pg_isready` readiness loop, and only
  `DATABASE_URL=postgresql://postgres@127.0.0.1:55439/cloudpainter_test`.
  The server was stopped and the temporary directory removed.
- Browser validation used the isolated Vite server at
  `http://127.0.0.1:4178/`, the fabricated non-secret publishable test key,
  and system Chromium 152.0.7977.64 at `/repl/tools/bin/chromium`.
  Instruments passed 4/4; drawing colors, keyboard shortcuts, and logo browser
  each passed 1/1; clipboard browser passed 3/3; on-device outline model passed
  1/1 (dog and cat labels, no hosted requests). Photo export passed 11/14:
  PDF print-resolution inspection did not find expected embedded JPEG artwork,
  narrow-phone content measured 345px at a 320px viewport, and the local-PNG
  confirmation test timed out waiting for `upscale-route-disclosure`.
  Tooltips passed 3/4; the broad “every workspace button” hover/focus test
  could not find a tooltip. These failures remain visible and are not waived.
- An earlier run collected 47 account-free browser cases but hit the
  240-second timeout with project-state expectations that omitted normalized
  photo-view defaults. Those fixture mismatches are now corrected. Exact
  project snapshots also wait for framing autosaves to settle, and the
  immediate-reload history check derives its paused clock from the browser's
  current time.
- The final no-auth run of
  `env -u CLOUDPAINTER_AUTH_STATE CLOUDPAINTER_TEST_URL=https://$REPLIT_DEV_DOMAIN/ pnpm --filter @workspace/cloudpainter run test:anonymous-photo-and-images`
  passed all 47 selected cases in 2 minutes, under the 240-second suite timeout.
  Playwright runs four tests in parallel; the app, image-generator and pan-limit
  files remain selected. The sole exclusion is the explicitly named
  `signed-in generation` group, which requires an authorized Clerk
  storage-state fixture. Image API endpoints are locally stubbed; no paid
  provider requests or signed-in browser state are used.
- `pnpm --filter @workspace/cloudpainter run typecheck` remains blocked by 58
  existing errors in CloudPainter/API generated exports and outline-related
  modules. No application or generated API code was changed for this work.
- `yq -o=json '.' .github/workflows/cloudpainter-ci.yml` plus Node structural
  assertions passed for YAML parsing, exact PR/`main`-push scope, read-only
  permissions, PostgreSQL health check, job dependency, unconditional aggregate,
  finite timeouts, and five immutable action-SHA pins. `bash -n` passed all ten
  workflow `run` blocks. Direct aggregate probes confirmed success/failure/
  skipped/cancelled behavior. The forbidden-construct scan found no merge-queue,
  schedule, manual, deployment/release, `pull_request_target`, path filters,
  secret references, mutable action refs, or `continue-on-error` in this CI
  workflow.
- `git diff --check` and generated API freshness checks passed. The five action
  references match the reviewed immutable commits listed above.

The workflow's `playwright install --with-deps chromium` command was not run on
this NixOS host. Local browser tests used the available system Chromium instead;
the Ubuntu runner's browser/dependency installation remains unverified here.
No remote Actions run was triggered. Remote event behavior, workflow activation,
branch-policy enforcement, and required-check status remain unverified.

## Remaining manual GitHub settings

After these files are reviewed and pushed through the repository's normal
process, an authorized repository administrator should:

1. Confirm the workflow appears and runs for a pull request and a push to
   `main`; inspect every job and the exact source revision.
2. After resolving or explicitly dispositioning the locally observed browser
   failures, decide whether `ci-required` should be required by the `main`
   branch ruleset or branch protection. Check whether branch-policy features
   are available under the repository's current plan; no plan or settings were
   inspected.
3. Separately verify that the selected stable check name is required and that
   failed, skipped, or cancelled validation cannot satisfy it.
4. Do not add secrets, environments, or write permissions for this validation
   workflow.

## Rollback and follow-up actions

Before rollback, inspect current branch protection/rulesets and any open
pull-request checks to see whether they reference `ci-required`. If referenced,
first update those rules through an authorized GitHub settings change; only
then remove `.github/workflows/cloudpainter-ci.yml` and its aggregation helper
and test. Keep this handoff as the record of why coverage was removed or
replaced. No rollback or GitHub setting change is performed by this task.

Suggested manual checklist:

- [ ] Review the local-to-remote matrix and exclusions.
- [ ] Review public-fork behavior and confirm no credentials are available to
  pull-request code.
- [ ] Inspect first real PR and `main` push runs; record revision, event, every
  job result, and skipped/cancelled cases.
- [ ] Separately verify whether branch rules require `ci-required`.
- [ ] Keep branch rules and this workflow synchronized before any future
  removal or rename.
