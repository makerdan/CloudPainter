# Portable unit CI shell regression guard

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

This is focused local stub evidence, not a passing full CI pipeline. It does
not establish that the selected package scripts exist or that their actual test
suites pass.
