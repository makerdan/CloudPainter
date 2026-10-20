# GitHub Actions CI workload maintenance handoff

## Authorization and pre-edit state

Project: CloudPainter, `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`; native task #57.
The approved native plan records the owner's selection **“Authorize gate-only
prerequisite (recommended)”** after selecting the public-repository path.
This is canonical Unified owner-directed maintenance, not an admitted GitHub
Actions application plan. No ordinary identity is allocated for this work.
No remote visibility or settings claim follows from that earlier selection.

On 2026-10-19, complete authoritative native records #1–#63 were read.
Dependencies #53 and #56 are MERGED, with actual delivered source accessible
at source anchor `532bd5f`. The Skill Mirror Sync implementation/handoff and
Runtime Safety utilities/handoff are present. Their fast and standard additions
are preserved, including Runtime Safety's final ordering. Only #57 is
IN_PROGRESS; #61 is PENDING behind it, and #60 remains PROPOSED.
No affected active/ready/merging ordinary task was found.

The live registry has nine records. Native-linked records belong to completed
#13, #14, #41, #50, #53 and #56 (including #41's incomplete reservation).
The other two are historical migration/lifecycle documentation records.
There is no activeRun or retained local gate lease, nor an observed gate runner,
supervisor or amendment process. No cancellation, reclaim, process signal,
live amendment or historical reopening is authorized or performed.
Locally “provisioned” historical records are not evidence of host eligibility.

Before edit:
- Raw tier SHA-256: `54e276f492bb7ae2f6492d1d6165cfdd04414c50e158b5e68f383298f0615c50`.
- All four definition hashes (SHA-256 of JSON.stringify of the entire table):
  `58f3ec04fe58a55f769a55956e631116832fccfb6f1795e23d9d0ec4c06cd4ea`.
- Raw registry SHA-256: `ddbc8d5e1553c9b671112935ebba972b75bbea8a542cf9b3512fafd2d9d60ba4`.
- Raw policy SHA-256: `6a59bad4c1ad86cb18d3fa3161643047b023dbe2b39e8e37a8a24198d72ad583`.
- Raw baseline SHA-256: `352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871`.

The baseline was re-read through the real loader: schemaVersion 1, entries [].
There are no catalog-backed ignores; this is not an executed clean baseline.
A passing retry establishes intermittency, not pre-existing provenance.
The separate incomplete-check investigation is neither a waiver nor a blanket
prerequisite.

The exact before table is tracked in `evidence/ci-tiers-before.json`.
All definition hashes change even though test-fast's object remains identical.
Historical hashes, sealed plans, runs, bindings, tombstones and identities must
remain unchanged. No eligible affected ordinary binding needs amendment now.
Any future authorized resumption against an old definition needs supported
`amend-plan.mjs`, coverage/authorization reassessment, native payload
reconciliation and fresh preflight; maintenance cannot perform that live amendment.

## Frozen scope and governing revisions

Only append the three specified CI commands to test-standard, with cwd `.`,
node-tap and exact matching retry prefix/suffix. Preserve all earlier commands,
relative order, targets, inheritance, prerequisites and limits. No hash-scheme
change, capability, fifth tier, application/CI guard/workflow edit or custom
definition installation/update is authorized.

Canonical sources read under `.agents` (SHA-256):
- Unified: `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`.
- Regression Guard: `6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1`,
  including enforcement and delivery references.
- Install GitHub Actions: `d34cd47ccb669f562a110285c2f34a0edb576c956ff8b262e25a59d37da3ccf5`.

Classification: material compatibility-contract / behavior-change at the gate
workload boundary. Normal Regression Guard cases belong in
`scripts/tests/failure-gate.test.mjs`; no self-satisfying exemption or deferral.
Maintenance results and the future normal application/admission route are
recorded below after execution. This record itself grants no task admission,
tier PASS, remote activation, branch protection or independent verification.

## Delivered workload and caller coverage

The only live table delta is these three appended standard steps (all cwd `.`,
adapter `node-tap`):

| Step | Exact argv command |
|---|---|
| ci-required-results | `node --test --test-reporter=tap --test-timeout=15000 scripts/ci/check-required-results.test.mjs` |
| ci-api-coverage | `node --test --test-reporter=tap --test-timeout=15000 scripts/ci/api-test-coverage.test.mjs` |
| ci-browser-safety | `node --test --test-reporter=tap --test-timeout=15000 scripts/tests/browser-safety-lanes.test.mjs` |

Each retryPrefix is exactly
`["node","--test","--test-reporter=tap","--test-timeout=15000","--test-name-pattern"]`;
retrySuffix is its exact one-element test-file array. The existing runner's
isolated retry route remains the only supported filtered retry; it retains
bound context and cannot substitute for the full workload.

After raw table SHA-256:
`e8fa100e55df3315d7a6600fd72fe4cec65c110632e2f4cc8a5b7ffd632f46cd`.
After whole-table definition hash for **every** tier:
`86ca97c23def205fd22d5d1bd182145ffaa3658a0cb5fd903a89aa2f9e654cd6`.
The complete table is `unified-tiers.json`; removing just those final three
steps yields the exact before snapshot. The earlier Runtime Safety gate cases
now inspect their pinned delivered boundary (`evidence/ci-tiers-before.json`,
with its independent expected hash) instead of incorrectly treating a later
authorized addition as a defect. Both original Runtime Safety cases still run.
The new complete-table comparison chains preservation through that boundary;
no earlier checks or assertions were removed.

| Tier | Effective steps before → after | Total / per step / cleanup ms | Effective prerequisites |
|---|---|---|---|
| test-fast | 4 → 4 | 120000 / 60000 / 5000 | none |
| test-standard | 10 → 13 | 900000 / 300000 / 10000 | none |
| test-standard-plus | 12 → 15 | 1800000 / 300000 / 10000 | verified-disposable-database-route |
| test-heavy | 14 → 17 | 2700000 / 300000 / 10000 | database route above and verified-disposable-browser-route |

Target stays `cloudpainter-repository` throughout. Inheritance stays
standard → fast, plus → standard, heavy → plus. Fast's exact post-dependency
object is unchanged, including workspace-skill-sync. Both Runtime Safety tests
and its final scan remain unchanged in standard before the appended CI steps.
Policy capabilities remain empty.

Real caller inspection: `store.mjs:tier` resolves explicit inherited steps and
hashes the whole table. `plans.mjs:inspectPlan` rejects wrong-tier and changed
definitions. `regression-contract.mjs:assertRegressionWorkload` recognizes the
literal Node test file, reporter and timeout here, not opaque passing package
aliases. Current RG/Unified preflight and runner admission call that checker.
The four root tier aliases use `validation-tier.mjs` / the checked CLI and
`runner.mjs:run`; retries use registered prefixes/suffixes with original context.
This registration does not govern independent CI, intercept native Start or
prevent arbitrary editor commands. Host lifecycle/authorization remain separately
Agent-observed; fixture-supplied context is not host approval.

### Offline safety inspection (not suite execution)

- `check-required-results.test.mjs` imports only Node built-ins and the local
  aggregation helper. It reads workflow text; child CLI checks run the exact
  helper with an empty environment or inert NEEDS_CONTEXT, finite timeout and
  bounded output. No GitHub request or workflow dispatch occurs.
- `api-test-coverage.test.mjs` imports Node built-ins, reads workflow/manifests
  and checks literal referenced files. Its executable workflow excerpts first
  pass strict statement/command admission, then run in mkdtemp roots with only
  purpose-built pnpm/env/setsid/sleep stubs on PATH. Command selection, status
  aggregation, inert connection strings and actual owned timeout cleanup are
  tested, not package suites. Real Bash/setsid/sleep are used only for local
  command supervision. The only DATABASE_URL in those child environments is
  fixture text; no PostgreSQL client/server, network connection or provider is
  invoked. No host database/Clerk/provider environment is forwarded.
- `browser-safety-lanes.test.mjs` imports Node built-ins and the pure
  provider-request guard. It passes fake route objects to local abort handlers
  and reads config/source text. It does not import Playwright, launch Chromium,
  contact the API, sign in or send a provider request.

These are CI wiring/recurrence checks, **not** execution of the remote
pipeline's application suites, database service or browser journeys. The
inspected suites are unchanged and were not separately executed in maintenance.

## Requirement → case → assertion → result

All cases below are in `scripts/tests/failure-gate.test.mjs`, exercised in the
single complete maintenance run on disposable private roots. Provisioned IDs,
native references, cancellations and amendments in these cases are synthetic;
they never write the live registry.

| Label / risk | Actual case and detecting assertions | Observed result / disposition |
|---|---|---|
| CI-01: omitted, duplicated or substituted CI workloads | “CI workload additions are explicit and inherited once”: complete independent exact argv/retry/cwd/adapter oracle; entire table minus the final three equals the pinned before table; real tier loader finds every file once in standard/plus/heavy and absent from fast. For each of three commands, negative controls remove, duplicate, rename-duplicate, substitute a no-op, or change retry/cwd/adapter/timeout; each fails the oracle. | ok 50; 616.973699 ms. Delivered, no full CI execution claim. |
| CI-02: lost existing checks, budgets or prerequisites | “CI workload additions preserve tier limits and prerequisites”: compare entire fast object; compare all prior inherited steps in order and resolved prerequisites through the real loader for all four tiers; assert standard's exact 900000/300000/10000 limits and empty capabilities. | ok 51; 62.389221 ms. Delivered. |
| CI-03: named guard file not really included | Inside CI-01, provision current-contract fixtures for all three files across all four tiers; real Unified and RG preflight accept explicit inclusion in standard/plus/heavy, fast rejects before the dispatch sentinel. Higher tiers still report execution BLOCKED for missing capabilities. | ok 50. Registration/admission proof only, not host authorization or high-tier readiness. |
| CI-04: stale/wrong tier dispatch or historical rewriting | “CI definition changes reject stale context without rewriting history”: seal under before table for all tiers including fast; all stale preflights, dispatch callbacks and bound runners reject. Every wrong-tier combination rejects. Entire registry bytes and every plan remain identical. One supported **fixture-only** amendment restores standard local preflight; old supplied seal then rejects. Each CI command's removal/no-op/duplicate/renamed duplicate refuses through real runner and dispatch; no sentinel or run directory appears. Historical record/tombstone serialized bytes and all other plan bytes stay identical; amended ledger stays unchanged on refusals. | ok 52; 768.308209 ms. Delivered. Live history untouched. |
| CI-05: prior delivery lost during integration | Both original “Runtime Safety registration…” and “Runtime Safety changed whole-table context…” cases execute against the pinned prior boundary. CI-01 compares complete current table against that same boundary; no unrelated addition can satisfy it. | ok 1 and ok 2. Delivered. |

## Bounded maintenance evidence

Executed once, 2026-10-19T19:09:15Z–19:09:43Z, source anchor `532bd5f`
plus the delivered gate test/table diff:

```sh
env -i PATH="$PATH" HOME="$HOME" python3 -B scripts/failure-gate/supervisor.py \
  120000 10000 generated-artifacts/ci-workload/gate.log \
  '["node","--test","--test-reporter=tap","--test-timeout=45000","scripts/tests/failure-gate.test.mjs"]'
```

The inspected unchanged supervisor uses monotonic deadlines, isolated child
sessions, Linux subreaper adoption, incarnation-checked descendant cleanup,
bounded TERM/KILL phases and observed quiescence. It captures at most 1,000,000
bytes (stricter than 1 MiB); output-cap, timeout, lost parent, raw failure or
uncertain cleanup is not success. The caller checked exit 0, blocked null and
quiescent true; the enclosing shell also had a finite 145000 ms ceiling.
No budget was increased and no retry was needed.

Raw supervisor result:

```json
{"exit": 0, "blocked": null, "quiescent": true, "bytes": 14972}
```

Raw TAP summary:

```text
1..61
# tests 61
# suites 0
# pass 61
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 27738.071577
```

Full local raw log: `generated-artifacts/ci-workload/gate.log`,
SHA-256 `56ccccb1635438ef5716ca174a21d42f19f0d0c04517fca1993a672d727a29a8`.
Supervisor JSON: adjacent `supervisor.json`,
SHA-256 `4337151cc87351cbf5caf4e5fa8f92f1c598cfcc2864b25b07282f2dcefd7cfd`.
Generated logs are intentionally Git/deployment-ignored and may not travel to
another checkout; exact raw result/summary and snapshot identities are preserved
in this tracked handoff, not misrepresented as a remote run.

| Tested source | SHA-256 |
|---|---|
| scripts/tests/failure-gate.test.mjs | 7d43120a44d2b9bb05fafadaa3ab9561777ad9a5facf2d13a3a863f1cd9a69f6 |
| scripts/failure-gate/store.mjs | 9e317743f4b1f9818884e6e253a5efec395f0780268057c61cff6c4dcf68f31b |
| scripts/failure-gate/plans.mjs | 4c4a1f43efe4376d845b682ae6f13ed2b3ce6438584978887fd39efcc091f690 |
| scripts/failure-gate/preflight.mjs | 473074e0af34bed9db4dda94e258fc6613640db417a7905dd7a5e7e97c1c630c |
| scripts/failure-gate/regression-contract.mjs | a0c94cef50b53ce0079ce6bbaec4f8a5a679849036e3ea86f835a302bd91bd42 |
| scripts/failure-gate/runner.mjs | 03c3901c95e888cf648e8eaf60429b3fd8ecbfccbc0bb3f791007e1e19437a2e |
| scripts/failure-gate/supervisor.py | 98770c9d377093f91c63a445453ace0e02022bd127e47d4cdca5e3a4b58c0851 |
| scripts/ci/check-required-results.test.mjs (inspected, not executed) | 0f268a384465fe3210a8c7c2d76e9ce3ef75a5b969c57df2d4e7da0cabb8b7c3 |
| scripts/ci/api-test-coverage.test.mjs (inspected, not executed) | 04f93fdf0186a885e8f92c30186111b0a89bc2b2a27e296554a1a5149b03c423 |
| scripts/tests/browser-safety-lanes.test.mjs (inspected, not executed) | 314f0d794070aab2558425e0a4b0f93fa9c57a4a0f9b8502e0a0fbe6b99e54f7 |

Maintenance status: **successful**, 61/61, not a bound-tier PASS or ordinary
plan admission. `node --check` and `git diff --check` also succeeded.
The unchanged public app preview rendered without a fatal console error;
no workflow was restarted. That screenshot is not backend/auth verification.

## Future GitHub Actions planning/admission handoff

This task creates or approves **no** GitHub application or verifier task.
The downstream Poe coverage maintenance and Runtime Safety application work
already exist; do not duplicate them or assume automatic continuation.

Verified local constraints:
- `scripts/new-plan.mjs` calls `cli.mjs` → `plans.mjs:provision`. Current
  contracts require an inspected `nativeTaskRef`; duplicate native linkage and
  legacy retrofits are denied. Registry transactions write the tracked
  `docs/validation/unified-task-registry.json`, **outside `.local`**, before
  sealing `.local/tasks` plans. Neither native Start nor a draft admits work.
- `prepare-plan.mjs` / `preflight.mjs:prepare` can select the lightest adequate
  registered workload from inspected required steps and validate a concrete
  candidate. Its preview is unallocated and cannot dispatch; it neither
  provisions nor grants approval.
- A Planner cannot perform the necessary tracked registry write. No native
  reservation API, atomic native/local provisioning interface or autonomous
  host/executor preparation scheduler was established here. Calling an
  unsealed native draft “admitted” would be incorrect.

Supported preparation handoff, before publishing an ordinary implementation plan:
1. Re-read canonical Install GitHub Actions and required companions. Establish
   repository visibility by fresh authorized read-only evidence; earlier public
   path selection is not a current observation. If a visibility change is needed,
   the owner performs/confirms it and it is rechecked. No original receipts are
   requested.
2. Refresh the full portable inventory and exact local-to-remote command/event
   mapping, security, fork policy, pins, runtimes, lockfile/install reproducibility,
   generated inputs, services, shards and aggregation. Assess actual local
   command-validation needs; these three wiring fixtures are not a full pipeline.
3. Use an authorized host/executor **preparation** handoff to obtain and inspect
   a durable native reference without claiming implementation admission, and
   pass the complete concrete specification to an executor allowed to run the
   existing provisioner and persist its registry transaction. The host can read
   and update existing task payloads via `getProjectTask`/`updateProjectTask`;
   these are not Node imports. This task does not demonstrate a native draft
   creation/reservation route or create such a reference. If the host cannot
   provide that preparation handoff, the smallest missing capability is an
   authorized host/executor route that supplies an inspectable native reference
   and persists normal provisioning **before** final implementation-plan
   publication. Keep the candidate blocked, not admitted.
4. Provision normally with one adequate tier, complete baseline/RG declarations,
   seal and pass plan-time guards. Deliver the exact six-field native/sealed
   payload, persist/read it back in full, reconcile scope/revision, and verify
   actual applicable owner authorization/lifecycle. A Planner receives the
   prepared sealed result; it does not fabricate a registry reservation.
5. Use current expected-context preflight and guarded dispatch before affected
   edits. An amended older binding needs supported amendment/reseal, fresh native
   readback and evidence-impact resolution. Do not bind #57 as that implementation,
   reuse completed IDs, hand-reseal history or skip plan-time admission.
6. Only after the full Apply primary is durably eligible and read back, apply the
   canonical skill router's required separate **read-only** application-verifier
   handoff, bound to that actual primary/scope/revision with a real dependency.
   This maintenance is not that primary or its verifier. No verifier is created,
   approved, run or claimed completed here.

The above is a source-verified local sequence and an explicit host preparation
boundary, **not** proof of an installed end-to-end automatic scheduling route.
Later executor work must validate the final full bound workload; fixture-only
maintenance cannot stand in for it.

## Remaining prerequisites and affected-work disposition

- Empty capabilities still block the database/browser routes. Do not select an
  inadequate lower tier or call CI fixture stubs real service coverage.
- The dependency handoff reports repeatable standard-tier failures: eager
  api-outline import without DATABASE_URL and actual repository port-scan
  findings in existing workflow/documentation sources. They were not rerun,
  fixed, ignored or reclassified here. The fail-fast scan precedes these appended
  CI steps, so registration does not prove they can currently be reached in a
  successful full standard run. Future authorized work must resolve the exact
  owning scope and local command-validation prerequisites; the downstream Poe
  maintenance already owns the proposed import-isolation delta.
- Reconcile every later tier change before admitting dependent work; whole-table
  hashes change across tiers. Historical #53/#56 seals and run results remain
  historical, not evidence against the new definition. Completed tasks are not
  reopened. No affected active ordinary task needs an amendment at delivery.
- Repository visibility, remote workflow activity/current-event results and
  required branch policies were **not observed in this maintenance**. Prior CI
  source exists, but fully applied/active/passing/merge-protecting GitHub Actions
  is not claimed. Remote mutation, dispatch, publication, visibility/billing and
  branch policies need their actual separate authorization and evidence.
- Gate-maintenance separate read-only application review was not selected.
  The future full GitHub application has the required separate read-only
  verification described above; it is not already performed.
- No live registry, task binding, ID, baseline, tombstone, capability flag or
  canonical custom skill was changed. The final immutable-file comparison and
  authoritative native recheck are recorded in the delivery reconciliation below.

## Delivery reconciliation

At 2026-10-19T19:12:54Z the complete native inventory #1–#63 was read again.
#53/#56 remain MERGED and their full descriptions match the initial read;
#57 remains the sole IN_PROGRESS task with unchanged authorized description
and dependency #56. #61 is still PENDING behind #57. No affected ordinary
active/ready/merging binding requires amendment. No new work was provisioned.

After maintenance, exact byte comparison against committed HEAD confirmed:

| Preserved live file | SHA-256 (identical before/after) |
|---|---|
| unified-task-registry.json | ddbc8d5e1553c9b671112935ebba972b75bbea8a542cf9b3512fafd2d9d60ba4 |
| unified-policy.json | 6a59bad4c1ad86cb18d3fa3161643047b023dbe2b39e8e37a8a24198d72ad583 |
| failure-baseline.json | 352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871 |

The real loader still reads nine registry records, zero activeRun records,
zero baseline entries and zero retained gate leases. Process inventory found
no remaining gate supervisor, bound runner or owned runtime-child fixture.
The tested gate-test SHA and whole-table definition hash are unchanged.
Only handoff and gate-maintenance memory documentation were written after
the passing run; no measured source was invalidated.

Delivered scope is the tier table, disposable gate tests, complete prior-table
evidence and this handoff (plus a durable gate-fixture authoring note). No app,
CI workflow/guard file, skill definition, package, runtime utility, capability
or live history change is included. Existing queued downstream tasks already
cover planned next steps, so no duplicate follow-up proposal was created.
