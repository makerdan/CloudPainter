# CloudPainter Runtime Safety — application handoff

## Disposition

**Complete for the selected Runtime Safety scope; no deployment or optional
restart control is claimed.** The final delivered implementation passed two
complete consecutive `test-standard` runs on the same implementation and
governing-source snapshots. Both runs were bounded, all 16 required steps
reported raw exit 0 and quiescent cleanup, and no manual port/process/lease
clearing occurred between them. See the retrievable run receipts below.

Canonical read-only inventory of the three configured service ports returned
exit 2, `PROHIBITED`, reason `core has no development-workspace exception;
production indicator blocks`. The authoritative classifier reaches that
specific branch for the runtime-managed `REPLIT_ENVIRONMENT=production`
indicator. The environment metadata interface separately identifies
REPLIT_ENVIRONMENT as runtime-managed; it supplies no editable project value.
This observation is **not** proof that the task checkout is a published app,
nor permission to disregard its indicator or extrapolate parent-shell
admission to a supported workload subprocess.

The approved scope expressly excludes development attestations/exceptions,
advanced reclaim, production operations and removal of genuine production
markers to make tests pass. Those parent flags were not changed. No test skip,
conditional pass or alternative permissive inventory was added. The existing
approved tier runner supplies its local workloads a credential-free environment
with NODE_ENV=test. Actual owned service starts and canonical inventory execute
under that already-adopted boundary, not the parent shell. No runner or
environment policy was changed for this task. Parent-shell inventory remains
unavailable; supported assigned-tier activation evidence is independently
obtainable. The initial inference that parent denial blocked all execution was
corrected from actual run and caller evidence.

## Identity, original obligations and admission

- Project: `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`; native task `#60`.
- Unified identity: `FGU-051daf4d-8f30-41b5-8a9b-e52d282518e3`.
- Seal: `69efd7e4760e33869b12566e81c22122558573104939cce70e424da078318330`.
- Contract: `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`,
  representation unified-v4.
- Assigned tier: test-standard; whole-table fingerprint
  `6c00f6acd84534a2e81f0dbaf268594f22c864d66a827b3582da8e5fa0c21cb3`;
  tier-file SHA-256
  `6ccd5a5300f75e7bc0bb4a26ba3e80adfe8d7d8478c8319c1f20a264a76ba2de`.
- Exact six-field native payload was persisted and read back in full; local
  observed context: `.local/tasks/runtime-application-native-context.json`.
- Read-only preflight passed before edits and again before workload dispatch:
  LOCAL_PLAN_VALID_HOST_CHECKS_REQUIRED, local prerequisites available. Actual
  native IN_PROGRESS eligibility and unchanged approved owner scope were
  separately inspected. Neither Start nor local preflight supplies approval.
- The owner selected Runtime Safety only, adopted the October 18 source and
  application instructions, confirmed the backup, and covered the minimal
  existing-tier workloads. Those unchanged decisions were reused; no new
  receipt, backup, tier, reviewer or workload authority was requested.
- The baseline catalog is readable schemaVersion 1, zero entries. This is not
  an executed clean baseline. No ignored baseline or owned repair is declared.
- Normal Regression Guard assessed all eight categories. Material categories:
  bug-fix, behavior-change, error-handling, concurrency-lifecycle,
  performance-reliability, compatibility-contract. No data, privacy, provider
  or UI behavior change is selected.

The original complete native work package is preserved before the explicit
sealed payload. The normal plan retains its original expected outcomes:
configured strict ports; shared owned-server lifecycle in actual photo/outline
callers; narrowly classified scanner; real boundary guards; two complete
successful standard runs without manual clearing; C01–C12 delivery mapping.
No original obligation was removed or weakened.

## Adopted source/input identities

| Canonical input | SHA-256 |
|---|---|
| App Support Ops SKILL.md | 571805eb3a9bcbce80200d283d59ccf47eba017cb6cd2967b59d9c4aaa82e774 |
| Port Authority SKILL.md | b495c93a5fe9495d396fb8615a1cca6eaf66d01244072f05ff58790406102717 |
| Port Authority runtime-contract.md | fa022a5b1749f9ea53b1e88c5264a28b845799927cbac6588e14fc21ae47384a |
| Regression Guard SKILL.md | 6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1 |

The approved source archive/manifest and complete source-installation evidence
remain in `app-support-ops-definition-handoff.md`. Native prerequisites
#53/#56/#57/#58/#59 were retrieved; all are MERGED. Actual source and workload
outputs were inspected, not inferred from those labels. No source drift was
observed in the pinned canonical definitions. No skill file or mirror changed.

The runtime workload handoff and subsequent CI workload handoff preserve their
own prerequisite outcomes. This task does not reopen or implement those
prerequisites or treat their fixture results as actual caller proof.

## Capability matrix / selected mode

| Capability | Observation / consequence |
|---|---|
| Existing interactive client | Present: CloudPainter Vite/React workspace; no UI change selected. |
| Managed service configuration | Present: API `/api`, CloudPainter `/`, sandbox `/__mockup`; original artifact manifests unchanged. |
| API health | Present: actual health router returns schema-validated status ok at `/api/healthz`; process health only, not DB/provider readiness. |
| Actual self-starting harnesses | Present: photo export and outline subject; staged adapter integration described below. |
| Externally supplied preview | Present: Playwright configuration requires CLOUDPAINTER_TEST_URL, owns no service; unchanged. |
| Local finite supervisor | Present: Linux subreaper and exact-incarnation discovery from adopted gate supervisor; adapter activation blocked by runtime context. |
| Production-safe runtime admission | Parent-shell inventory returned the core's explicit PROHIBITED classification and sent no signals. The exact admitted Unified runner uses its pre-existing credential-free `NODE_ENV=test` subprocess boundary; its actual owned local lifecycle and inventory assertions passed. No environment marker was removed and no new exception was added. |
| Safe development restart adapter | Absent in inspected API routes/client/startup. Health and workflow start commands are not authorized exact restart capabilities. |
| Production exclusion of restart UI/API | Unproven/not applicable to an absent surface; no fabricated positive absence test. |
| DB/browser capability routes | Unavailable in gate policy; neither required nor provisioned for these process/HTTP/config guards. No photo/outline browser scenario or provider/database request was run. |

Only Runtime Safety is selected. Help, onboarding, Admin Analytics, Combined
mode, outage/restart UI/API, product features and deployment are not selected.
Development-control gates: interactive benefit present; safe controllable
restart absent; production exclusion of such a control unproven. Therefore
that optional surface is **ineligible** and is not implemented.

## Pre-install versus staged caller changes

The pre-edit tracked source is the task checkout's starting Git HEAD. It had
nonpositive/NaN-only PORT checks; incomplete Vite strictPort; duplicated
probe/release/spawn/fetch/TERM-only photo and outline harnesses; the separate
registered scanner/lifecycle fixtures from the prerequisites.

Delivered changes:

- `scripts/runtime/configured-port.mjs` validates decimal 1..65535, with a
  declaration for TypeScript consumers. API entrypoint validates before app
  initialization; both real Vite configs consume it and set strictPort for
  development and preview. Artifact service ports, routes and ownership remain
  unchanged.
- `scripts/runtime/owned-server.mjs` is called by both actual harnesses; no
  browser assertion changed. It owns only newly spawned work. External-preview
  Playwright configuration remains unowned and unchanged.
- `owned-service.py` uses the adopted supervisor's discovery plus its own
  independent finite subreaper lifecycle, private startup gate and incarnation
  registration, finite output and exact-owned TERM/KILL/discovery loop. Parent
  loss, timeout, abnormal exit, cancellation, uncertainty or missing cleanup
  evidence remain non-successful; private state is retained.
- `vite-service.mjs` uses ephemeral probe/handoff with at most three attempts;
  a released probe is explicitly not treated as a reservation. Vite's actual
  strict config denies collisions; diagnostics call the canonical read-only
  inventory. Each server has private dependency-cache and preview-test output,
  not another global lease or shared dist mutation.
- `readiness.mjs` bounds request and body reading, startup and cancellation,
  rejects redirects/oversized bodies, and checks actual JSON health or
  CloudPainter HTML/Vite/base-path identity instead of arbitrary HTTP 200.
- Scanner changes classify only complete known CI service endpoint declarations
  backed by their actual service/step metadata. Adjacent executable literals
  remain findings. The local CI command now consumes its step-owned PORT; no
  remote workflow operation or unrelated CI refactor occurred.
- Documentation port instructions use the configured environment; historical
  observed targets remain factual prose, not runnable inline assignments.

The paired final runs below are on this delivered state. The two earlier failed
full runs and their bounded retries are retained in the same gate ledger; they
were not relabelled as pre-existing or added to the empty baseline. The first
full run exposed one intermittent non-successful discovery/cleanup and one
incorrect test-only `tsx` loader. The next full run passed both lifecycle
suites but the real scanner exposed four unclassified existing literals in a
database-denied fixture and two documents. Those were fixed with exact,
evidence-backed fixture classifications and factual documentation, without
blanket test/document exclusions. Subsequent acceptance was run only after
these fixes on one unchanged source snapshot.

## Requirement → caller → guard → route

| Requirement | Staged actual caller and guard/assertion | Observed status |
|---|---|---|
| R1 configured ports | API index and both actual Vite configs → runtime-port-policy “service configs reject invalid PORT and preserve managed bindings”; invalid API-start/config integration, valid configured value/base and strict dev+preview assertions; actual Vite dev/preview collision denial | Passed in both complete accepted runs. API invalid `PORT` is exercised before application import; the exact API `app.listen(port)` call is asserted. A live API-app collision was not attempted because it would import DB/auth/provider application wiring; Vite actual configured listeners are collision-tested. |
| R2 allocation/collision | Actual photo-export/outline source call sites and `finally` teardown → runtime-lifecycle “actual harness adapters allocate concurrently and handle held collisions”; two live Vite listeners, distinct endpoints, non-root base, both apps' dev/preview held collision, canonical protected inventory and unrelated sentinel preservation | Passed in both complete accepted runs; same source snapshot. |
| R3 readiness | Shared `checkReady` through actual adapter → “real service readiness rejects hangs redirects and wrong responses”; actual health router mounted at `/api/healthz`, real Vite root/base, finite timeout, negative status/type/body/redirect/hang cases | Passed in both accepted runs; health fixture invokes the real router without starting DB/auth/provider services. |
| R4 teardown | Shared Python/Node lifecycle → “actual owned lifecycle cleans failed cancelled and timed-out descendants” and “actual adapter owner loss stops registered work and discovery errors never authorize release”; positive registration/readiness; raw failure 7; execution timeout/cancellation; stubborn/late descendants; owner loss; exact termination/rebind; unrelated sentinel; actual discovery-I/O failure remains non-successful and private state retained | Both complete runs passed; each required lifecycle assertion passed. An earlier uncertain cleanup remained a visible potential-regression failure; neither the first full run nor its successful isolated retry was treated as baseline evidence. |
| R5 scanner | Required full repository scan plus extended runtime-port-policy cases; exact CI/platform declarations and the existing database-denied fixture only; copied, changed and adjacent executable inputs rejected | 511-file real repository scan returned zero findings in both accepted runs; no broad fixture/documentation exemption. |

These guards execute through registered standard-tier steps. Supported,
bounded isolated retries were used to diagnose initial failures; they are
separate from acceptance. Neither full accepted run was bypassed or manually
cleaned. Workload limits remain 300000 ms per step, 900000 ms whole run,
10000 ms cleanup. All inherited and later CI/Poe steps remained required and
passed; no tier, command, budget, inheritance or capability was changed.

## Full validation receipts and source snapshots

The native plan, sealed local plan and each complete run report are retained by
the project gate ledger under `.local/failure-gate/runs/`. This table copies
their stable IDs and content hashes into the tracked handoff. The two final
reports have identical implementation and governing-gate source snapshots:
implementation fingerprint
`be0b57ab9d2f528be7623d0120789c6683b9fa1859395b93c6ffa673212caed1`;
governing-source fingerprint
`4ff782bdfdea86d7e8a905777066d978b5d20b6f462434a221c43bf90f0aa844`.
Each of 16 required steps exited 0 and recorded `quiescent:true`; both reports
record raw full-tier PASS, no changed gate sources, and no skip.

| Run | Run ID | Started → finished (UTC) | Result-report SHA-256 |
|---|---|---|---|
| First accepted run | `281f3de0-e465-4290-83ae-e349c517d979` | 2026-10-19 21:08:04.827 → 21:10:40.799 | `66cd565536c2ae24af96a1fd8772595c42d4addf183b57b3c8ee3e4a5cfaf0dc` |
| Consecutive accepted run | `fdc53c8a-84aa-4b56-ba50-c8c785e7209c` | 2026-10-19 21:11:05.145 → 21:13:36.982 | `39952125d4661732c3e1001733f501c20e3ec2728573420bcb9f7ad91a08bc6a` |

For each run the dedicated runtime-port-policy suite passed 7/7 tests and the
runtime-lifecycle suite passed 9/9 tests. The inherited standard checks also
passed: workspace skill sync 19/19, gate unit 77/77, regression guard 33/33,
Port Authority clock 10/10, drawing tools 10/10, API outline 8/8, required CI
results 38/38, CI API coverage 261/261, browser-safety contract 6/6, Poe image
contract 35/35, Poe upscale 10/10, and Poe logo 18/18; typecheck and the real
repository scan exited 0. Every tested step's report shows quiescent cleanup.

The pre-install tracked source is baseline Git revision
`4b5f207ebaa397f67872591d59a8f372bd8a1979`. Changed caller/policy source
SHA-256 (before → delivered):

| File | Pre-install | Delivered |
|---|---|---|
| `artifacts/api-server/src/index.ts` | `9c1f296e0008006b40d766ee436697e43ef99cf907f2c7afe9a6cd2d6c118d3c` | `52f4bd221a0451bbe672aabb5f736cfbe1fcb2a77eac0be0ca76e934952cb8c4` |
| `artifacts/cloudpainter/vite.config.ts` | `3098a734aaad2002e2d08ee44ee90685f4a00a68c7f2ac0e8087126b30ed7a3d` | `ee3329047056a383197902682965fb5872b03526f1edf6c00efb4be903a8f531` |
| `artifacts/mockup-sandbox/vite.config.ts` | `7de0f52b190e4d8f0854ed852e7a0d24420b4242e22423c6dd2712e7b0497cc7` | `bcc83decf149ee70c90d3e84e2660f4c0ca815ecef3e6464676e5c8a478e71b6` |
| `artifacts/cloudpainter/tests/photo-export.browser.test.mjs` | `73dcdd5ca67a00d0c83b012e200f68ca7405cbd46fa52be48984f3320beae713` | `9c95484e2351d4ab184dd0b940f031eda43edcd198ac5c9d86cbbf6b50083ca2` |
| `artifacts/cloudpainter/tests/outline-subject-regression.browser.mjs` | `fa63fe5a3093b470b5f4574359a7d267d7a29e9e5483d502646bef9625dcd2e3` | `f580a0f3f8c16213c6eab7fd9b7d215b27518f4624cedc5d6188308fefce6750` |
| `scripts/runtime/configured-port.mjs` | absent | `a2e8450277240066edd5f4cc371de83374b5b92687d60733862dff0b610e8397` |
| `scripts/runtime/owned-server.mjs` | absent | `7dbf9fd2fe10cead52c5f212149d7f4c6b976f97d74a5ab36bca56c75aa7e6c5` |
| `scripts/runtime/owned-service.py` | absent | `94e40a7e339614892feab0defb22a8a3ba1881b44dab407f51223a64f4294a88` |
| `scripts/runtime/readiness.mjs` | absent | `4b7b47797b87c32ff044eef1b0ab63c8e331267d0a56651900a0219e84579423` |
| `scripts/runtime/vite-service.mjs` | absent | `6d43ef0eccd0c9b322bdef2a36af154051d20cd6b85b8dc376c73da124ef03c8` |
| `scripts/runtime/inventory.mjs` | absent | `90094fef08c9a91cee9f77b2d4f7da0086db8eb727b8cadc47db010b785338fe` |
| `scripts/runtime/service-gate.mjs` | absent | `7a6907e432df7c3d7e7a611bea7bc297deead5fc47da7cfa96f6532d336acb91` |
| `scripts/tests/fixtures/owned-service.mjs` | absent | `894116428dbfbacbb37b0a19da2f40c7d89c78d7551cb64342c5ab59952a7a59` |
| `scripts/runtime-port-policy.mjs` | `cd0d9c186b36047d49ac7b064ac1e9ca48f99b56a1ec9360269e1b5760825af3` | `d677717a92acd4bb16c311335c9e71b134e2497349d3e63737621855e4ff33c1` |
| `scripts/tests/runtime-port-policy.test.mjs` | `9c3b5fc8805e16604c887d35e6d2477543e2753ce6cc65bbd09698fd3bc10d98` | `dc6323d87183dc13963f19ba611b15adbbd16c6261f1efc094b2016973dcb1e8` |
| `scripts/tests/runtime-lifecycle.test.mjs` | `d3baa6130f3cfae8dd3c713ccc4a45448d349dab037642df2db6aa9d7a5295ae` | `f56af9675649df7e8080f6cada8eb2c2cfc0cd38f0d1559c255825b29b27b27e` |

The final screenshot showed the existing public CloudPainter page rendering.
It did not exercise a changed dialog or a signed-in workflow. Parent-shell
inventory still denies service inspection; live managed-service readiness and
the browser journeys were not separately asserted.

## Port Authority C01–C12

| Contract | Evidence / remaining gap |
|---|---|
| C01 | Original scope, pins, actual dependencies, baseline, native seal and preflight inspected before writes. |
| C02 | Actual canonical inventory returned PROHIBITED and sent no signals. Busy/unknown cannot authorize takeover; adapter uses that same discovery. |
| C03 | Production admission correctly denies parent-shell work. Approved test child is a distinct boundary; no scope expansion or flag edit. Invalid actual config/API startup assertions passed first run. |
| C04 | Actual artifact bindings/routes unchanged; both Vite dev/preview configs and live harness adapters were exercised. No managed service was restarted, moved or reclaimed; parent-shell live service health remains unverified. |
| C05 | Existing Unified target lease retained. No nested global lock; independent endpoints/private caches have no demonstrated additional conflict. |
| C06 | Existing outer tier supervisor plus independent finite service execution/cleanup limits; all 16 supervised steps quiescent in both accepted runs. No timed queue exists for independent servers. |
| C07 | Private gate, exact incarnation registration, independent subreaper, descendant discovery/escalation, uncertain state non-success and retained private state; owning adapter suite passed both runs. |
| C08 | Raw root exit versus timeout/cancellation/cleanup reasons are separately captured; missing quiescence is not success. Failed discovery/cleanup in the first full run remained visible and no baseline exemption was created. |
| C09 | No live resource recovery, age deletion or uncertain lease removal; no such permission requested or inferred. |
| C10 | Existing gate, baseline, history and workloads preserved; only normal new provisioning/runner records changed. |
| C11 | Actual caller wiring plus applicable positive/negative tests; two consecutive full authorized standard runs passed on the same implementation and governing-source snapshots. |
| C12 | Definition installed, workload maintained, normal plan admitted, actual callers integrated, independent runner outcomes recorded, parent shell/live readiness and restart-control eligibility reported separately from deployment. |

## Required next action and limits

The parent shell cannot inspect or manage service ports under its runtime
classification. Do not unset runtime-managed markers, weaken the classifier,
or mistake assigned-tier local lifecycle evidence for live-service readiness.
Any future request to enable a safe development restart requires a genuinely
available, authorized adapter and a new scoped decision.

No live listener was signalled/reclaimed, managed workflow stopped/restarted,
uncertain lease deleted, database/provider called, browser journey run, remote
CI dispatched or production deployment performed. The existing GitHub Actions
browser job still has its own TERM/wait process-group teardown and HTTP-200
startup probe; changing that remote workflow lifecycle was not part of this
local-harness change, and no remote workflow was triggered. The local Vite
preview readiness contract is directly tested and the CI workflow port
configuration is scanner-covered; this does not claim activation of a shared CI
owned-process adapter. Separate application review is **not selected**. No
reviewer task was created.
