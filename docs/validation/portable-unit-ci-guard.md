# Portable unit CI shell regression guard

## Literal package-script file references

The offline guard also checks the literal test-file and configuration-file
arguments in the fourteen selected portable package commands. It reads the
three existing manifests without modifying them or executing their scripts.
Each reference resolves relative to its fixed package directory and must be a
regular file; a directory does not satisfy the check. Missing targets report
the selected label, package, suite and literal filename.

Supported syntax is deliberately narrow: `node` or `tsx` with `--test`, the
currently used Node strip-types flag or `--import tsx`, and an optional finite
`--test-timeout`; or `vitest run --config <file>` with optional explicit test
files. Targets are unquoted literal package-relative filenames, optionally
prefixed by `./`. Multi-dot names such as `outline.test.ts` are supported.
Unsupported runners, flags, shell operators, comments, environment assignments,
expansion, globs, quoted paths, parent/absolute paths, missing targets and
malformed commands fail explicitly. No shell, module or general test-discovery
resolution is claimed. Config-only Vitest scripts establish config-file
availability, not the availability of files discovered inside that config.

Independent expected target lists cover every selected command, including the
upscale command's config and explicit test file. In-memory inventory fixtures
remove or rename every distinct referenced target; restoring the original
inventory is a positive control. Per-command fixtures replace each literal
argument with a missing renamed target, then supply that target as a positive
control. Unsupported-shape fixtures reject before file lookup. All real
manifests, referenced files and workflow configuration remain unchanged.

The owner approved one bounded offline launch with Failure Gate inactive for
this task only, then separately approved one corrected rerun. No checked
project-local governance route was verified or activated. Both used:

```sh
node --test --test-timeout=10000 --test-concurrency=1 scripts/ci/api-test-coverage.test.mjs
```

An independent monotonic supervisor capped execution at 30 seconds, reserved
10 seconds for owned-process cleanup and capped combined output at 1 MiB.
The first attempt exited 1 because the new filename matcher rejected multi-dot
names; this was a task-owned defect, not an ignored baseline. After correcting
the matcher, the approved rerun exited **0: 214/214 tests passed**, with no
failures, skips or cancellations, in approximately 1.38 seconds. Both attempts
confirmed unchanged input hashes and owned-process-group termination. Logs,
hashes, limits and the task-local supervisor are retained in ignored
`generated-artifacts/ci-literal-file-guard/`, with the failed attempt preserved
in `attempt-1/`.

CI coverage is **direct** through the existing
`node --test scripts/ci/api-test-coverage.test.mjs` guard step in `validation`
on pull requests and pushes to `main`; no new command, discovery pass or
workflow is needed. Remote activation, current remote results and required
merge status remain **unknown**. No package suites, credentials, databases,
providers, live services or CI workflow changes were used. This result proves
literal file availability and fixture behavior, not actual package-suite passes.

## Scope and route

The existing `scripts/ci/api-test-coverage.test.mjs` guard now also exercises
`Run portable unit and mocked-provider suites` from
`.github/workflows/cloudpainter-ci.yml`. The workflow itself is unchanged.

On 2026-10-11 the owner explicitly authorized one bounded local guard run,
with Failure Gate inactive for this task only. No active checked local route
was verified, and this approval does not activate or change project-wide
governance. The only command launched was:

```sh
node --test --test-timeout=10000 scripts/ci/api-test-coverage.test.mjs
```

No package suite, provider, database, browser, build, credential, remote workflow,
or application service was used or changed.

## Coverage and regression contract

The guard extracts the actual portable inline Bash script, then checks its
execution using a temporary `pnpm` stub. The expected ordered package/suite
list is maintained independently of workflow parsing. All fourteen executable
calls must occur exactly once; a comment does not supply coverage.

The stub identifies failures by the complete package/suite command, so the API
and frontend `test:outline` commands cannot be confused. Positive controls check
successful exit zero and per-suite reports. The first (`api-outline`) and last
(`cloudpainter-upscale-ui`) commands separately return synthetic exit 23:
the real Bash process must return exit 1, preserve that failure report, and
still execute every sibling.

In-memory mutations independently replace command status capture with zero,
discard failure aggregation, or force the final shell exit to zero. Both early
and late injected failures must reject each mutation. Other fixtures reject
comment-only selection, a substituted package or suite, and duplicate execution.
Mutations are restricted to the portable step and do not edit the workflow.

The new fixture admits only the current finite builtin shell statements and
literal `run_check ... pnpm --filter ... run test:...` command shape. Unsupported
executable statements fail before spawning. The fixture does not inherit
credentials or shell startup variables, and its PATH contains only the stub.
This is a narrow current-workflow guard, not a general shell sandbox or YAML
interpreter.

## CI coverage decision and limitations

| Check | Existing remote command | Coverage | Events |
| --- | --- | --- | --- |
| Extended portable/database shell guard | `node --test scripts/ci/api-test-coverage.test.mjs` in `validation`, step `Guard executable API database coverage` | Direct, no new discovery command or workflow | `pull_request`; push to `main` |

The workflow's validation job has a 45-minute cap. Configuration inspection
establishes selection, not current remote activation, passing status, or required
merge policy; these remain **unknown**. No remote run or branch policy was
inspected, triggered, or changed.

The new tests retain explicit 10-second test timeouts and 5-second synchronous
child-shell timeouts with 64 KiB buffers. There are no hooks, real package hooks,
workers, listeners, or daemonizing commands in their admitted execution graph.
An independent Python monotonic supervisor bounded the local run to 30 seconds,
reserved 10 seconds for owned-process cleanup, and capped combined output at
1 MiB. It used a private process group and confirmed that group was gone before
accepting the result.

## Recorded result

The single authorized launch returned **exit 0: 23/23 tests passed**, with no
failures, skips, cancellations, or unfinished tests. Elapsed supervised time was
approximately **0.67 seconds**. Input hashes remained unchanged during the run,
and owned-process termination was verified. Raw output, input digests, selected
limits, and the supervisor are retained in the ignored
`generated-artifacts/ci-portable-unit-guard/` directory.

This earlier result is focused local stub evidence, not a passing full CI
pipeline. By itself it does not establish that the selected package scripts
exist or that their actual test suites pass.


## Read-only package-manifest extension

The guard now reads the real manifests at `artifacts/api-server/package.json`,
`lib/integrations-openai-ai-server/package.json`, and
`artifacts/cloudpainter/package.json`. It extracts the fourteen literal portable
commands from the workflow and compares them with the independent coverage list.
Each selected package must resolve to exactly one inspected manifest, and each
selected suite must be an own script entry containing a nonempty command string.
The check does not execute those strings or package hooks.

For every selected package/suite, independent in-memory fixtures remove its
script, rename its script key while preserving the command, or replace its
command with empty, whitespace-only, or non-string content. Each must fail at
the package/suite-specific assertion, not at shell status handling. Three
package-name mutations additionally prove that scripts cannot be borrowed from
another package. All real manifests and the workflow remain untouched.

The owner authorized a task-local bounded offline run, then separately approved
one corrected rerun. No active project-local checked route was verified; these
approvals authorize only this local operation, not activation or modification of
project-wide Failure Gate governance. The exact command was:

```sh
node --test --test-timeout=10000 --test-concurrency=1 scripts/ci/api-test-coverage.test.mjs
```

The first attempt rejected three package-rename fixture expectations because
Node appended comparison details to assertion messages. The guard itself
correctly rejected those renamed packages. After correcting that assertion
shape, the approved rerun returned **exit 0, 120/120 tests passed**, with no skips
or cancellations, in approximately **0.75 seconds**. The independent Python
supervisor enforced 30 seconds execution, 10 seconds cleanup and 1 MiB output;
owned descendants were reaped, the private process group was gone, and all five
input hashes were unchanged during both runs. Both attempts and the supervisor
are retained under ignored `generated-artifacts/ci-package-manifest-guard/`.

CI coverage remains direct through the existing guard step on pull requests and
pushes to `main`; no new workflow or duplicate shell-status fixture was added.
Remote activation, current passing status, and merge requirements remain unknown.
This proves package script entry availability, not dependency installation,
underlying test-file existence, command semantics, or actual package-suite passes.
No package suites, credentials, provider calls, application workflows, or live
services were used.
## Multiple-failure extension

On 2026-10-11 the owner separately approved one bounded stub-only local run for
the multiple-failure extension, with Failure Gate inactive for this task only.
The earlier task-specific approval was not reused as authority.

The portable stub now accepts a set of complete package/suite commands. Two new
positive cases fail the first and last commands together, or fail the first two
commands before successful siblings. In each case the real Bash script must run
all fourteen exact commands once, preserve every ordered pass/failure report, and
exit 1. Report assertions precede the exit assertion, so negative aggregation
fixtures also prove command selection and both failure reports remain intact.

Both cases reject an in-memory `failed=$((1 - failed))` mutation specifically at
the final exit assertion. This builtin-only mutation is explicitly admitted by
the fixture parser: rejection is behavioral, not merely an unsupported-statement
error. Two failures cannot cancel one another into a passing result. Existing
single-failure, all-success, selection and unsafe-command controls remain.

The authorized command was
`node --test --test-timeout=10000 scripts/ci/api-test-coverage.test.mjs`.
An independent Python monotonic supervisor enforced a 30-second execution limit,
10-second cleanup allowance and 1 MiB output cap, with a private process group
and a credential-free child environment. Each test retains its 10-second limit,
and each stub shell retains a 5-second limit and 64 KiB buffer. There are no hooks
or daemonizing commands in the inspected graph.

The single run returned **exit 0: 41/41 tests passed**, with no failures, skips or
cancellations, in approximately **0.76 seconds**. Both input hashes remained
unchanged and the owned process group was confirmed stopped. The supervisor,
raw output and hash/result record are retained under the ignored
`generated-artifacts/ci-multiple-failures/` directory.

CI coverage remains direct through the existing guard step shown above; no
workflow, package suite, provider, database, credential or service was used or
changed. Remote execution and required merge status remain unknown.
