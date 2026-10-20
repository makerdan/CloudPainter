# Poe Setup validation-coverage handoff

## Context and authorization

- Scope: owner-authorized, gate-only prerequisite to later Poe Setup work. No
  ordinary Unified identity or tier run was allocated for this maintenance.
- The owner approved including the existing mocked Poe contracts in
  `test-standard`. This does not authorize paid provider calls or establish that
  Poe Setup is fully applied.
- Canonical Regression Guard classification: **compatibility-contract,
  security-privacy** at the validation workload and test-fixture boundary.
  The standard workload now covers three existing contract suites and keeps the
  existing API outline suite. No Poe feature or product-test implementation
  changed.
- Canonical source fingerprints at delivery:
  - Failure Gate Unified: `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`
  - Regression Guard: `6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1`
  - Poe Setup: `b33352c78df386b45f09439df6146f160ef717f0f596eb2e5c239462837e83f4`
    (rechecked; unchanged, not edited)
- Tested source snapshot: repository anchor `9d8d9e592b4c00c8afa85278cf0a8731e0e69142`;
  `unified-tiers.json` SHA-256
  `6ccd5a5300f75e7bc0bb4a26ba3e80adfe8d7d8478c8319c1f20a264a76ba2de`,
  `poe-fixture-env.mjs` SHA-256
  `87a572912632296ed3c3bfb138fa13bd35e415b534eec1e2a072a39695053dd3`,
  and `failure-gate.test.mjs` SHA-256
  `76fd87ea5cc6ec50d01e650e90fabfe62a804f165bc7984eac78f34904d9fa8d`.
- Prerequisites reconciled from their actual delivery: Skill Mirror Sync #53
  and Runtime Safety #56 are merged; CI workload maintenance #57 is merged.
  Their actual existing fast/standard checks and final ordering were preserved.
  See `workspace-skill-sync-application-handoff.md`,
  `app-support-runtime-workload-handoff.md`, and
  `github-actions-ci-workload-handoff.md`.
- The current native task query showed no other pending, in-progress,
  implemented, merging or queued task besides this maintenance. The local
  registry showed no active run; `.local/failure-gate/locks` was empty; no gate
  runner or supervisor process was present. Historical/completed local
  provisioned records were not treated as evidence of host eligibility. No
  task, plan, binding, ledger, tombstone or baseline record was modified.
- The current baseline catalog was read through the gate loader: schema v1,
  `entries: []`. This is not a clean executed baseline and does not reclassify
  historical failures.

## Exact workload delta and definition impact

The frozen complete pre-Poe table is
`docs/validation/evidence/poe-tiers-before.json` (SHA-256
`e8fa100e55df3315d7a6600fd72fe4cec65c110632e2f4cc8a5b7ffd632f46cd`).
It is the delivered post-CI table; its canonical JSON fingerprint is
`86ca97c23def205fd22d5d1bd182145ffaa3658a0cb5fd903a89aa2f9e654cd6`.
The immediately preceding CI and Runtime Safety snapshots remain available at
`evidence/ci-tiers-before.json` and `evidence/runtime-tiers-before.json`;
their original fixtures still compare against those exact boundaries.

Only these three `node-tap` steps were appended to `test-standard`:

| Name | cwd | Command / test file |
|---|---|---|
| `poe-image-contract` | `lib/integrations-openai-ai-server` | `node --import tsx --test --test-reporter=tap --test-timeout=30000 tests/poe-image.test.ts` |
| `api-poe-upscale` | `artifacts/api-server` | `node --import ../../scripts/failure-gate/poe-fixture-env.mjs --import tsx --test --test-reporter=tap --test-timeout=15000 tests/image-upscale.test.ts` |
| `api-poe-logo` | `artifacts/api-server` | `node --import ../../scripts/failure-gate/poe-fixture-env.mjs --import tsx --test --test-reporter=tap --test-timeout=15000 tests/logo-images.test.ts` |

Each step has the registered isolated retry prefix matching its runner, preload
where applicable, reporter and timeout, followed by `--test-name-pattern`, and
the exact test file as its retry suffix. A retry cannot replace the complete
workload.

The existing `api-outline` test file, timeout and assertions are unchanged; its
command and retry prefix now both import the same safety preload. No other
existing workload command changed. `tests/image-access.test.ts`, which creates
database schemas, is not included. The shared Poe image suite tests the four
code-approved image-model choices with stubbed transport; this is not a suite
per Poe bot and does not call Poe. The API cases cover the fixed Assistant
upscale and logo routes. No application suite was executed as maintenance proof.

| Tier | Effective checks before → after | Definition fingerprint before → after | Limits (total / step / cleanup ms) | Prerequisite |
|---|---:|---|---|---|
| `test-fast` | 4 → 4 | `86ca97c2…` → `6c00f6ac…` | 120000 / 60000 / 5000 | none |
| `test-standard` | 13 → 16 | `86ca97c2…` → `6c00f6ac…` | 900000 / 300000 / 10000 | none |
| `test-standard-plus` | 15 → 18 | `86ca97c2…` → `6c00f6ac…` | 1800000 / 300000 / 10000 | `verified-disposable-database-route` |
| `test-heavy` | 17 → 20 | `86ca97c2…` → `6c00f6ac…` | 2700000 / 300000 / 10000 | `verified-disposable-browser-route` |

The definition loader fingerprints the entire table, so all definition hashes
change despite an unchanged effective fast workload. The new raw tier JSON
SHA-256 is `6ccd5a5300f75e7bc0bb4a26ba3e80adfe8d7d8478c8319c1f20a264a76ba2de`;
the full-table fingerprint is
`6c00f6acd84534a2e81f0dbaf268594f22c864d66a827b3582da8e5fa0c21cb3`.
Every tier receives this same full-table fingerprint. The target, inheritance,
prerequisites, capabilities and all budgets remain unchanged. In particular,
the post-dependency `test-fast` step list is byte-for-byte unchanged.

Registry impact was checked, not repaired: its raw SHA-256 remains
`ddbc8d5e1553c9b671112935ebba972b75bbea8a542cf9b3512fafd2d9d60ba4`.
Policy and baseline raw SHA-256 values likewise remain
`6a59bad4c1ad86cb18d3fa3161643047b023dbe2b39e8e37a8a24198d72ad583` and
`352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871`.
No still-eligible ordinary work was visible in the current native task query.
Completed or historical local bindings were preserved without resealing or
reopening. If older work becomes eligible for resumption, reassess its scope
and authorization, reconcile the native payload, and use the supported
amendment/reseal and preflight route for the changed whole-table definition.
This maintenance performed no live amendment.

## Fixture delivery and observed evidence

The gate-owned preload
`scripts/failure-gate/poe-fixture-env.mjs` sets only the fixed fake
postgresql://fixture:fixture@poe-fixture.invalid:1/fixture URL (a non-connectable
import placeholder, not a runnable target) required for
database-module import. It patches the workspace `pg` Pool, Client and
Connection entry points to throw before transport. The runner's sanitized
environment is unchanged; no host database or provider credential is forwarded.

The four new tests are in `scripts/tests/failure-gate.test.mjs`:

| Risk | Case and detecting assertion | Result |
|---|---|---|
| Missing, duplicated or substituted checks; non-exact retry; loss of the prior table | “Poe checks are the exact mocked suites in standard and inherited tiers”: exact command/cwd/adapter/retry oracle; negative controls for each step; real tier resolution and Regression Guard/preflight inclusion for the three Poe files and outline file; `test-fast` is denied. | `ok 50` |
| Unrelated work, fast workload, tier limits, target, prerequisites or capabilities altered | “Poe workload changes preserve prior checks, limits, prerequisites and the fast definition”: full before-table comparison apart from the exact additions and outline preload; unchanged fast object and all tier limits/prerequisites. | `ok 51` |
| Wrong tier or stale whole-table definition runs work or rewrites history | “Poe stale and wrong-tier workloads deny dispatch and leave all historical bytes unchanged”: wrong-tier/stale context rejects before sentinel, and ledger plus sealed plans remain byte-identical. | `ok 52` |
| Real DB configuration or transport leaks into the API fixture; local HTTP stops working | “Poe fixture preload replaces fake database config, blocks pg before transport and permits ephemeral HTTP”: child starts with synthetic import-time DB config; it imports the actual `@workspace/db` module with the preload, asserts the fixed fake URL, invokes pool/client operations against a socket sentinel, verifies zero transport, and completes an ephemeral loopback HTTP request. Runner sanitizer checks provider-key absence in the child; parent environment key-presence metadata is unchanged. | `ok 53` |

The existing “credentials and NODE_OPTIONS are not forwarded to validation
children” runner case remains in the same full suite and also passed. This
disposable child check is not a database operation: the PostgreSQL methods throw
locally before network dispatch.

**Bounded maintenance validation (not a tier PASS):**

```text
python3 scripts/failure-gate/supervisor.py 180000 10000 generated-artifacts/poe-gate-validation-final-2.log '["node","--test","--test-reporter=tap","--test-timeout=45000","scripts/tests/failure-gate.test.mjs"]'
supervisor: exit=0, blocked=null, quiescent=true
TAP: 65 tests, 65 pass, 0 fail, 0 cancelled, 0 skipped
duration: 39187.16063 ms
```

The finite outer supervisor was separate from the child process group and
reported confirmed cleanup. Full raw TAP output is retained locally at
`generated-artifacts/poe-gate-validation-final-2.log`; it is ignored generated
output, not a tracked validation artifact. A filtered preload-focused diagnostic
also passed, but the full 65-test result above is the reported maintenance
validation. No top-level tier, API provider suite, paid request, database
service, browser session, remote CI, deployment, or live application service
was run.

## Requirement-to-delivery disposition and remaining work

| Requirement | Delivered evidence | Status / limitation |
|---|---|---|
| Exact once-only standard and inherited Poe workload; keep outline | Exact delta table, pinned prior table, `ok 50`, `ok 51` | Delivered as registration and fixture evidence only. |
| Import safety without secrets or PostgreSQL; keep local HTTP usable | Gate preload and `ok 53`; unchanged runner sanitization test in full suite | Delivered through a supervised disposable process, not by running the API contract suites. |
| Stale/wrong-tier denial; no historical record edits | `ok 50`, `ok 52`; unchanged live registry hash; disposable denied dispatches | Delivered; no live amendment or tier PASS is claimed. |
| Future full Poe Setup application | No product/provider changes in this task | **Not done.** It requires a separate normally admitted Apply scope after this prerequisite: reconcile applicable requirements for image generation, logos, hosted outlining and Assistant upscale; verify route/model capabilities and authorization at transport; preserve existing contracts, no retry/substitution, consent, privacy, local-only editing and shared/account budgets; validate response/media bounds, cancellation and error privacy. Do not add a Replit AI fallback merely for chatbot-only obligations: the product has no chatbot and uses a Poe-only provider policy, so record the applicability finding. Budget changes need an approved disposable database route; otherwise preserve and test injected route-budget boundaries. |
| Normal admission and separate application verification | Gate-maintenance exception explicitly excludes both | **Not done.** The concrete resume action is to reassess the lightest adequate current registered tier, read the current baseline and Poe contract, prepare/seal the full Apply candidate through the supported normal provisioner, read back and reconcile its exact native payload and authorization, then run supported preflight before edits. Do not reuse this maintenance or historical identities. After an eligible full Apply primary is durably recorded and read back, create its separate read-only verification task through the router. There is no automatic wake-up or native scheduling guarantee. |

No separate verification was selected for this gate-only maintenance. This
handoff is an executor record, not independent review, application acceptance,
normal admission, or evidence that a later tier is runnable.
