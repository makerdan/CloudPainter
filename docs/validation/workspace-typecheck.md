# Workspace typecheck validation

## Authorization and scope

The owner explicitly selected “Authorize the scoped checks” for the workspace
typecheck repair, with Failure Gate inactive for this operation only. This is
not an installation or a change to CI/governance policy. The approved scope was
shared declaration preparation, the new isolated regression fixture, focused
CloudPainter diagnostics, and the canonical root typecheck. The focused API
Server route was also exercised as a subset of the same canonical checks.

Limits: five minutes per supervised command and fifteen minutes cumulative
including children and retries. A separate Python parent enforced a narrower
270-second execution limit, reserved 20 seconds for cleanup, and persisted
consumed monotonic time between invocations. Before validation, a one-second
supervision fixture launched a sleeping parent and child: timeout terminated
the owned process group, and `/proc` inspection confirmed no live members.
Actual validation children were pnpm, Node, and TypeScript, with no detached
workers or remote jobs. Every check ended with confirmed process-group
quiescence. The supervision fixture is an expected timeout, not a typecheck pass.

Raw logs and the command/exit/time records are local ignored artifacts under
`generated-artifacts/workspace-typecheck-validation/`. This document records
their outcomes; those disposable files are not required to run validation.

## Diagnosis and repair

The low-level CloudPainter check reproduced **65 diagnostics**, exit 2:
TS2305/TS2724 missing exports, TS2339 stale response fields, TS6305 missing
outline declarations, and downstream TS7006/TS7031 implicit-any errors.
The affected symbols exist in current source. Workspace dependency links and
composite project references were present. The old React-client declarations
lacked current palette/settings/logo/outline/upscale exports and account fields;
the Zod declaration barrel lacked the upscale helper; outline-core had no
declaration output.

The original `pnpm run typecheck:libs` (`tsc --build`) succeeded without forcing
a rebuild or regenerating source. After preparation, all consumer diagnostics
cleared. No genuine remaining API/outline type errors or unrelated current
typecheck failures were observed.

The canonical root command still prepares libraries before checking artifacts
and scripts. Its preparation entry point now shares a fail-fast lock with the
two supported focused commands. The focused route runs the same incremental
root library solution, then the chosen leaf check with `--noEmit`.
The package-local `typecheck` commands remain low-level consumers, so the
canonical root's parallel leaf checks do not concurrently prepare declarations.

No compiler settings, application/UI source, generated API files, OpenAPI
contracts, PNG/PDF behavior, or test exclusions changed. No browser suites,
application builds, code generation, providers, databases, or production
operations were run. Runtime workflows were not restarted: this repair only
changes validation scripts, and an API restart would run an out-of-scope build.

## Recorded command outcomes

Each command below ran inside the independent parent supervisor.

| Command | Raw outcome | Elapsed |
| --- | --- | --- |
| `pnpm --filter @workspace/cloudpainter run typecheck` before preparation | exit 2; 65 diagnostics | 10.45 s |
| `pnpm run typecheck:libs` using the original library route | exit 0 | 4.43 s |
| `pnpm run test:workspace-typecheck` | exit 0; 3 tests passed, none skipped | 11.71 s |
| `pnpm run typecheck:cloudpainter` | exit 0 | 4.34 s |
| `pnpm run typecheck:api-server` | exit 0 | 4.19 s |
| `pnpm run typecheck` | exit 0; libraries and all four leaf packages passed | 4.49 s |

Cumulative supervised execution including the supervision proof: **40.63 s**.
No incomplete required validation remains.

## Regression coverage and supported commands

`scripts/tests/workspace-typecheck.test.mjs` creates disposable workspaces,
copies the actual supported script definitions and runner, and uses the
installed TypeScript compiler without touching live build outputs. Each
focused route is exercised against three composite libraries exported through
source barrels and consumed via workspace-style links/project references.

Both routes cover absent output with a failing direct-check control, changed
exports with a stale-declaration failing control, successful preparation,
a warm repeat without forced declaration rewrites, and a nonexistent export
that still fails after preparation. A separate fixture proves preparation
conflicts fail before output is written, genuine library errors fail rather
than being suppressed, the lock is released on normal failure, and the root
library route prepares declarations usable by a direct consumer check.

Use from the repository root:

```sh
pnpm run typecheck
pnpm run typecheck:cloudpainter
pnpm run typecheck:api-server
pnpm run test:workspace-typecheck
```

After shared-source changes, do not treat a package-local consumer check as
complete validation without preparation. Do not run raw `tsc --build`
concurrently with supported routes. An interrupted check may leave
`.workspace-typecheck.lock`; confirm the check and all children are stopped
before manually removing that file. Age or a missing parent PID alone is not
proof that declaration-writing children stopped.
