# Runtime Safety validation workload handoff

## Authorization and pre-edit reconciliation

The owner's October revision decision recorded in the native plan authorizes
the exact three standard-tier commands below and confirms that the backup
exists. No new Remix was created or independently verified here. Source-definition
adoption is separate: canonical skill files are unchanged. Only Runtime Safety
validation utilities and their wiring are selected; no live runtime controls,
Help, Analytics, outage/restart surface, service restart or deployment is included.

On 2026-10-19 the complete native task inventory (63 records) and complete
native tasks #56 and #53 were read through the host. #53 is MERGED; its actual
tracked delivery and sealed payload were inspected. Its workspace-skill-sync
step remains in test-fast unchanged. Only #56 is executing; #57 is queued behind
it. No other isolated active/ready/merging task was present. No local gate lock,
activeRun field or running gate supervisor/runner was found. No process was
signalled, no lease deleted and no historical task reopened.

Pre-edit whole-table definition fingerprint (SHA-256 of JSON.stringify(table)):
`96320bc7e7cfbb05ac37418bdbb3f90f4c4e8ce8dccf31da859ab089437ea644`.
Pre-edit raw tier file SHA-256:
`57506fdfe1696018165a8b3274e9a36c476126a71a5abfad36dd25390f1d1e5c`.
Pre-edit raw registry SHA-256:
`4b92e306a74adb127ef4e65ce43c24d43df832bd4856eb73e978c6c9c3b04950`.
The full before table is preserved in
`evidence/runtime-tiers-before.json`; the after table is
`unified-tiers.json`. A focused fixture compares the complete objects after
removing exactly the three additions, not just selected budgets.

All eight existing local records were inspected. The migration and lifecycle
documentation records are historical. Native-linked records belong to merged
work (#14, #13, #41, #50, #53); #41 also retains its incomplete reservation.
All remain byte-preserved during maintenance. Their locally provisioned status
does not authorize reopening completed native work. There is no still-eligible
affected implementation binding requiring amendment. Future resumption of any
old eligible binding must use supported amendment, not hash substitution.

The baseline catalog is readable schemaVersion 1 with no entries. This is not
an executed clean baseline. No ignores or baseline repairs are authorized.
The separate intermittent gate-supervision investigation remains unresolved.
A passing retry establishes intermittency, not pre-existing provenance.

## Frozen delta and maintenance phase

Add to test-standard, cwd `.`, preserving all existing commands and their relative order:

| Step | Adapter | argv |
|---|---|---|
| runtime-port-policy | node-tap | node --test --test-reporter=tap --test-timeout=15000 scripts/tests/runtime-port-policy.test.mjs |
| runtime-port-scan | exit | node scripts/check-runtime-ports.mjs |
| runtime-lifecycle | node-tap | node --test --test-reporter=tap --test-timeout=60000 scripts/tests/runtime-lifecycle.test.mjs |

Final execution order: inherited checks, runtime-port-policy, runtime-lifecycle,
all prior standard checks in their prior order, runtime-port-scan. The scan is
last because the runner fails fast: real source findings outside repair scope
must not prevent observing the other required checks. This changes no argv,
adapter, retry, budget, prerequisite or required coverage. A post-provisioning
gate-only ordering reconciliation preserves the same implementation identity,
uses supported amendment and renews its native payload before workloads.

Both Node suites register the same file/timeout with the supported
`--test-name-pattern` retry prefix. Filtered retries cannot replace the full
workload. test-standard-plus and test-heavy inherit each addition exactly once;
test-fast is entirely unchanged. All targets, prerequisites, inheritance,
300000 ms standard step / 900000 ms run / 10000 ms cleanup limits remain unchanged.
The whole-table hash scheme is unchanged; all effective tier hashes change.

Gate maintenance uses the canonical owner-directed exception, not a task ID
or a tier PASS. Runtime implementation/readiness is pending normal admission
and actual deliverables. No registry, binding, tombstone or baseline mutation
is permitted in this phase.

## Admission, delivered checks and results

Gate maintenance completed with 58/58 tests, no skips/cancellations/failures:
`node --test --test-reporter=tap --test-timeout=45000 scripts/tests/failure-gate.test.mjs`
under the existing Python supervisor with 110000 ms execution / 10000 ms cleanup.
Raw log: `.local/runtime-maintenance/gate.log`. Supervisor result:
`{"exit":0,"blocked":null,"quiescent":true,"bytes":14391}`.
The raw live registry hash still exactly matches its pre-edit hash.
After whole-table definition hash:
`46dce8b728ade9f59c0c9a1c09180dab0e2fe2bc8f7e43d20e6d91d2b0521476`.
This is maintenance success, not application/tier execution or runtime activation.

Normal implementation admission and runtime test results are recorded below
when observed; maintenance did not allocate a live identity.

### Normal admission and ordering amendment

Exactly one fresh identity was provisioned with `scripts/new-plan.mjs`:
`FGU-1c51dcfd-5c3a-4422-8ece-43a989ed2b90`, linked to native #56.
The initial plan hash was
`7f880c4c2ea4c651894a07ef0d5276ca9cc65578d2b9310af44bed76790076ab`.
Both initial and amended exact payloads were written to the native task and
read back in full; original owner-approved scope text was preserved.

After the initial seal but before any application workload, the fail-fast
ordering issue above was reconciled as gate maintenance. Both focused
registration fixtures passed, supervised with 60000 ms execution / 10000 ms
cleanup; raw `order.log`, exit 0, blocked null, quiescent true.
Native inventory again showed no other active/ready/merging work, no retained
local lease or activeRun was present, and no old binding was amended.
The only affected eligible identity was the newly provisioned implementation.
Supported `amend-plan.mjs` retained that ID and test-standard, recorded
authorization applicability/evidence impact and renewed its seal to
`d2b714ffacfc0d74a43abf190f7703dd207e32b61af1165640343b01bb63f8df`.
Already authored scanner/test sources remained inside the same approved scope;
no earlier runtime evidence existed or was retrospectively certified.

Final whole-table definition fingerprint:
`58f3ec04fe58a55f769a55956e631116832fccfb6f1795e23d9d0ec4c06cd4ea`.
Final raw table SHA-256:
`54e276f492bb7ae2f6492d1d6165cfdd04414c50e158b5e68f383298f0615c50`.
The supported plan guard and pre-implementation preflight passed for the
native-readback context. Unified contract:
`2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`;
adopted Regression Guard source:
`6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1`.
Preflight explicitly reports host authorization/lifecycle NOT_OBSERVED:
the Agent separately inspected the actual eligible native task, original
owner decision and exact payload immediately before edit/run batches.
This is cooperative enforcement, not a native Start interceptor/editor lock.

### Delivered requirement/case/assertion/runner map

Classification: compatibility-contract, concurrency-lifecycle,
performance-reliability. Normal coverage, no N/A, deferral or self exemption.

| Requirement / affected layer | Delivered cases and detecting assertions | Supported runner |
|---|---|---|
| RG-RUNTIME-01 / scanner | `scripts/tests/runtime-port-policy.test.mjs`, six cases: rejects direct/aliased/object hardcoded binds and environment fallback; rejects executable/test URLs in config/workflows/scripts/docs; accepts environment equivalents and explicitly labelled examples; rejects an executable URL even when nearby prose says “passed”; exact fixture-literal **and source-line role** exceptions cannot exempt fetch/connect; real listen(0) has a live port until confirmed close; real Git inventory includes new source and rejects symlinks. The deliberately unsafe inputs are negative controls scanned without modification. | runtime-port-policy, node-tap, 15000 ms test timeout |
| RG-RUNTIME-01 / repository | `scripts/check-runtime-ports.mjs` calls `scripts/runtime-port-policy.mjs` with a bounded Git tracked/untracked inventory. Reports only file/line/rule, never source or credentials. Inventory/read/type/size failures exit 2; findings exit 1. The actual repository result is independent from fixture success. | runtime-port-scan, exit adapter |
| RG-RUNTIME-02 / sockets | `scripts/tests/runtime-lifecycle.test.mjs` — “concurrent live reservations, observed readiness, collision denial and confirmed close”: simultaneous listen(0), distinct actual ports, successful requests, EADDRINUSE on an attempted collision, original listener still responds; release/rebind follows awaited close. No probe-then-bind allocator. | runtime-lifecycle, node-tap, 60000 ms test timeout |
| RG-RUNTIME-03 / process supervision | Same suite — “failure” and “timeout” cases execute the actual Python supervisor against `scripts/tests/fixtures/runtime-child.mjs`. A detached descendant really listens and reports readiness through IPC before parent dispatch evidence. Failure preserves exit 7; timeout is explicitly post-dispatch with a 4000 ms execution allowance, not an assumed 200 ms startup. Both require quiescent true, exact PID/start-incarnation disappearance, rebind after cleanup and unrelated live-process/listener survival. | runtime-lifecycle |
| RG-RUNTIME-03 / cancellation | Same suite — “cancellation”: after positive listening/dispatch evidence, kill only the owned fixture wrapper; actual independent supervisor detects supervising-parent-lost, terminates descendants within a finite bound, reports quiescent true; exact incarnations stop, port can be rebound and unrelated sentinel still responds. No pre-existing process is targeted. | runtime-lifecycle |
| RG-RUNTIME-03 / uncertainty and dispatch exclusion | Same suite — “actual discovery error retains gate protection”: a real unreadable proc-stat fixture causes the existing supervisor's discovery function to throw. The actual gate runner reports INCOMPLETE, retains its private target lease and refuses reuse. A separate owned, known-undispatched lease first proves immediate queue/lock denial with no sentinel dispatch. This runner has no timed waiting queue; no queue-expiry claim is made. Uncertain fixture state is never “recovered”; the entire private root is disposed only after testing. No live registry or lease is changed by these cases. | runtime-lifecycle |
| RG-RUNTIME-04 / tier loader/admission | `scripts/tests/failure-gate.test.mjs` — “Runtime Safety registration…” compares the complete before/after table after removing exactly the three additions, verifies exact argv/adapters/retries and once-only inherited inclusion. “Runtime Safety changed whole-table context…” denies all wrong tiers, stale definition, omitted command and passing alias before any run directory; supported amendment restores admission and an unrelated historical record remains byte-identical. This is registration/admission proof, not runtime test or control readiness. | gate-unit, inherited unchanged from test-fast |

### Scanner scope and explicit distinctions

Scans JS/TS entrypoints and tests, Vite/config, Python/shell, package scripts,
workflow configuration and executable Markdown fences/inline commands.
Line patterns cover literal URLs, binds, port options/config/environment
assignments and shell fallbacks; the TypeScript AST additionally detects
constant aliases, object options and numeric environment fallbacks.
This is a static check, not general interprocedural analysis or proof that an
unknown dynamic expression is environment-owned.

No application or test directory is exempt. Ignored build/runtime material,
uploaded assets, authored `.agents` skill packages/memory (not host application
entrypoints), and the exact before-tier fixture snapshot are outside this
application scan inventory. Markdown example fences must explicitly say
`example`; historical result suppression requires a specific result-record
bullet shape, not merely the word “passed.” Host artifact manifest PORT and
localPort declarations are recognized only as complete service-config lines;
embedded run/build commands remain scanned.

The enumerated synthetic-data exceptions require exact path, complete literal
and complete source-line role: provider guard request.url data; CI expected and
rejected shared-target strings under shell stubs; two exact invalid-port
Poe URL rejection inputs. Nearby executable fetch/connect remains rejected.
No blanket fixture/test-directory/numeric-literal waiver was added.

### Observations before the final pair

The first bound run (`560169c7-7595-4973-a726-6c49bf5a2f65`) failed a
task-owned scanner-fixture assertion. Supported isolated retry
`36c28b59-2640-48df-8192-c8f79f1d5771` reproduced it. The matcher compared only
host/port against a full approved fixture URL; it was corrected to compare the
full URL and later tightened to the exact source-line role. It is not ignored.

Run `e4eba4c7-eb34-42dd-acd4-168a466c1d70` passed both new suites but then
failed the existing api-outline step before scanner dispatch. Isolated retry
`5ac96ed4-2fe2-4f00-87b9-2fef35ab7189` reproduced the module-import failure.
Independent unchanged-committed-source evidence and the precise limitation are
in `evidence/runtime-api-import-observation.md`. Supported per-plan
self-classification recorded that inference, without changing the baseline
catalog, environment, API source or required command. It permits subsequent
steps to be observed; the API test still exits 1 and its cases remain unrun.
This is not provenance inferred from a passing retry.

All-step observation `fa2587f9-3ae4-48d9-80ad-be22aedeb22e` reported FAIL.
Subsequent observations `b06e72cb-50e4-43bf-ac25-f3bf14aba4da` and
`ba477bb6-2443-48eb-9e09-058ccea1210b` also observed all ten steps, both
new suites passing and actual scan failing with nine findings. A final
documentation-policy regression assertion tightened historical-result parsing;
the final tested-source pair below supersedes those scanner results.

### Final pair, raw evidence and source snapshot

Full invocation for each run:

```sh
export UNIFIED_TASK_ID=FGU-1c51dcfd-5c3a-4422-8ece-43a989ed2b90
export TASK_PLAN_FILE=.local/tasks/FGU-1c51dcfd-5c3a-4422-8ece-43a989ed2b90.md
export UNIFIED_CONTEXT_FILE=.local/tasks/runtime-native-context.json
node scripts/check-unified-preflight.mjs "$UNIFIED_TASK_ID"
pnpm run test-standard -- "$UNIFIED_TASK_ID"
```

| Final run | UTC interval | Observed / required steps | Outcome |
|---|---|---|---|
| 894a8c48-cab9-4d4e-b074-ac7d0aa47788 | 2026-10-19 03:18:38.238–03:20:23.099 | 10 / 10 | FAIL, rawAllPassed false |
| e2a5a0ce-d27d-42f9-9819-725409eb9100 | 2026-10-19 03:20:44.901–03:22:22.266 | 10 / 10 | FAIL, rawAllPassed false |

No code/configuration edit or manual port/process/lease intervention occurred
between these two complete runs. Both implementation arrays and gate-source
arrays are exactly equal; changedGateSources is empty in both.
All new sources were staged before these final runs, so the runner includes
the scanner dependency and child fixture as well as the direct test entrypoints.

Each run observed: workspace-skill-sync 19/19, gate-unit 58/58,
regression-guard 32/32, port-authority-clock 10/10, runtime-port-policy 6/6,
runtime-lifecycle 5/5, drawing-tools 10/10; workspace-typecheck exit 0.
These passing suites have zero skipped/cancelled cases.
The api-outline module import exits 1 (its actual cases are **not run**).
The runtime-port-scan exits 1 after scanning 489 files with the same ten
findings below. No scanner finding was classified away.

All ten step reports in both runs have blocked null and quiescent true.
Lifecycle TAP includes the actual supervisor reports for failure, timeout,
supervising-parent-lost and discovery-error, with assertions for confirmed
owned-incarnation termination and unrelated sentinel survival. The deliberate
private discovery-error case retains protection as expected; this does not
indicate a live uncertain run. Final read-only inventory found no retained live
gate lock, activeRun or remaining fixture/supervisor process. No live recovery,
listener reclaim or uncertain-lease deletion was attempted.

Raw final report copies:

| Evidence | SHA-256 |
|---|---|
| generated-artifacts/runtime-workload/delivery-1/report.json | a57d316cf471b756b99cd7e3b2afe1f31f75016552e61ad8f1ae9c850c1cbb7c |
| generated-artifacts/runtime-workload/delivery-2/report.json | ea9771b4f81a078db71b3eccb148bdb4123faee0d133624bb844895d1a266a49 |

Per-step logs are adjacent to each report as step-0.log through step-9.log.
The exact tested source hashes, also included in each runner snapshot:

| Delivered file | SHA-256 |
|---|---|
| scripts/runtime-port-policy.mjs | cd0d9c186b36047d49ac7b064ac1e9ca48f99b56a1ec9360269e1b5760825af3 |
| scripts/check-runtime-ports.mjs | 17f844e83ab7c7f0f6b7943d80eb432c2efda0dd87a889fded77fa35c4a371b9 |
| scripts/tests/runtime-port-policy.test.mjs | 9c3b5fc8805e16604c887d35e6d2477543e2753ce6cc65bbd09698fd3bc10d98 |
| scripts/tests/runtime-lifecycle.test.mjs | d3baa6130f3cfae8dd3c713ccc4a45448d349dab037642df2db6aa9d7a5295ae |
| scripts/tests/fixtures/runtime-child.mjs | a8e6bb69eacc6b640a81785ff4b06be5ef7a3299661fb849ebc288bd8805acf9 |

### Required failures and exact owning files

| Owner | Lines in tested snapshot | Required finding / disposition |
|---|---|---|
| .github/workflows/cloudpainter-ci.yml | 133, 179, 184 | Literal database/test URL ports and a fixed shell PORT assignment. No workflow or remote CI operation was changed. |
| docs/validation/github-actions-installation-handoff.md | 114, 576, 579 | Inline executable configuration/URLs with literal ports. Preserved; not silently exempted as an entire historical directory. |
| docs/validation/port-authority-independent-verification.md | 113, 114, 115 | Inline literal PORT configurations in the service table. Preserved; host manifest declarations themselves remain narrowly recognized separately. |
| reports/logo-generation-validation.md | 16 | Inline fixed PORT assignment. Preserved. |
| artifacts/api-server/src/routes/outline.test.ts → routes/outline.ts → lib/image-budget.ts → lib/db/src/index.ts; scripts/failure-gate/runner.mjs | Eager import / credential-free environment boundary | DATABASE_URL import error before API test cases. Unchanged-source inference documented separately; still not successful API coverage. |

The exit-adapter repository scan has no registered isolated-retry route;
no unguarded scan was substituted for one. The two complete bound runs establish
repeatable **findings** and passing isolated lifecycle/scanner cases, not a clean
assigned-tier PASS. Source/documentation remediation and API-test isolation need
their actual approved scope before a genuinely green standard-tier result.
These are not permissions to edit the affected application/workflow files here.

The complete raw maintenance/intermediate/final reports, per-step logs and
observed native payload are preserved under ignored
`generated-artifacts/runtime-workload/` and exported as an evidence archive.
The runner's own authoritative reports remain under the registry's recorded
`.local/failure-gate/runs/` locations. Generated evidence is not deployed.

All eight historical registry records were compared with committed HEAD and
remain exactly equal as complete serialized records; only the supported new
identity, amendment, classification and run events were added. There is no
catalog ignore entry. No source definition, product file or runtime control
was changed. The existing public app preview still renders; the screenshot is
included in the evidence folder. It does not prove sign-in or backend readiness.

## Completion assessment

- Gate-maintenance registration: **successful**, separately supervised evidence.
- Normal admission: **valid**, one fresh identity, one standard tier, supported
  same-ID ordering amendment, exact native readback and preflight.
- Executable scanner/tests: **delivered**; both new suites pass twice on the
  final identical source snapshot.
- Assigned-tier outcome: **FAIL** twice, all required steps observed, with the
  precise raw failures above. No clean baseline or all-checks PASS is claimed.
- Live runtime/outage/restart controls: **not implemented or activated**.
  This task supplies validation coverage only, not CORE_VERIFIED control status.
- Optional separate application review: **not selected**. Completion review
  belongs to the host's completion operation, not a separately invented task.

## Control readiness

| Capability | Status and evidence |
|---|---|
| Application network services | Present: API `src/index.ts` requires PORT; both Vite configs consume workflow PORT and BASE_PATH. Host artifact manifests own routing/service configuration. No service configuration was changed. |
| Existing ephemeral test strategy | Present: API tests and browser fixture servers already use listen(0); new fixtures reuse it without an allocator service. |
| Bounded owned-process supervisor | Present and exercised: existing `scripts/failure-gate/supervisor.py`, subreaper, finite deadlines, incarnation-aware cleanup and outer runner target leases. Not a general listener-reclaim utility. |
| Interactive client | Present: existing CloudPainter preview renders. No client failure/reconnect journey was changed or browser-tested. |
| Application development restart/control mechanism | Absent: startup/routes/client search found no outage/restart surface; startup's process.exit(1) handles failed startup, not a safe authorized restart route. |
| Production exclusion of a future restart control | Unclear / not established: there is no such control to validate. This dependent capability remains ineligible, not a placeholder test that passes on absence. |
| Database/browser validation routes | Unavailable in effective gate policy; none provisioned. The existing API import error is preserved separately. |

No outage/restart route was identified in the API startup/routes and runtime
search during preparation. This task does not add one. A future control needs
all three capability gates, concrete server authorization/environment/direct
invocation and production exclusion checks, and a genuine authorized browser
route if its real journey needs it. None of the three steps above proves those
controls eligible, enabled or safe. No database/browser capability is provisioned.
Separate independent application review is not selected.
