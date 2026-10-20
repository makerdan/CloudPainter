# Failure Gate Unified — independent verification

## Result and scope

**Project:** CloudPainter  
**Project identity:** `4b60cdc8-3fdb-439e-b554-21dd7e77a03e` (matches the active policy and handoff)  
**Target:** `.agents/skills/failure-gate-unified/SKILL.md`  
**Operation:** read-only independent verification of the delivered gate-only maintenance  
**Result:** **Partial overall; local gate-maintenance acceptance passes.**

The local contract assessment is **PASS on the observed source/test snapshot**:
the fixed U01–U28 outcomes are supported by the inspected gate code, current
instructions and executed maintenance tests. The delivered repair is limited to
the authoring guide/template/context example and its detecting test. No remaining
local gate defect was identified in the inspected scope. This is not a current
ordinary validation-tier PASS or full runtime/platform readiness certification.

The overall verification remains **Partial** because runtime-visible mirror
parity was not inspected, a real platform task-agent launch/restart was not
performed, registered database/browser prerequisites are unavailable, and the
Router's durable dependent-task path has no eligible native primary here. These
limitations do not invalidate the passing local contract assessment and are not
recast as new gate requirements.

## Three evidence baselines

1. **Obligation baseline:** canonical Failure Gate Unified skill, 22,993 bytes,
   SHA-256
   `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22`.
   I independently hashed the canonical file and the `SKILL.md` member of
   `attached_assets/failure-gate-unified-current-canonical_1792464744209.zip`;
   both hashes and byte counts match. Archive SHA-256:
   `e12ef26d91a5f02244b8c54abe278422a242f0451e5965838d0cc13da6c13469`.
   The definition is already at the canonical location and the active policy
   pin matches; no install or pin change is required.
2. **Pre-change Project baseline:** the handoff records source revision
   `17d7fe0e517d78a9dcd996d99253d7dffa573004`, active policy and registry
   revision 121 with 13 records. I did not recreate the historical pre-edit
   checkout or independently establish a clean historical test baseline. The
   empty current baseline catalog is not evidence that historical failures never
   existed.
3. **Delivered snapshot:** inspected gate sources, the changed authoring guide
   and test, active policy/tier/baseline/registry files, handoff, evidence JSON
   and raw maintenance TAP log. The listed delivered hashes below are measured
   now. The installer handoff/evidence file is a discovery aid, not proof by
   itself; its relevant claims were checked against current source, tests,
   hashes and the log where available.

## Independent findings and reconciliation

The handoff identified a real guide defect: it named `unified-v3` while the
active policy specifies `unified-v4`, and its first authoring example omitted
the observed native-context export and preflight. The current guide now names
the policy's `unified-v4`, orders `UNIFIED_CONTEXT_FILE` and Unified preflight
before plan guard and bound-runner commands, and explains full native readback,
authorization and the limit of a local export. The appended test reads the
actual guide and policy and rejects disposable mutations for the old template,
missing context export and missing preflight. This is a method-only resolution
against unchanged canonical obligations; no obligation was dropped or expanded.

The raw `.local/unified-full-application/gate.log` was read directly. It records
the exact gate/RG maintenance run as 113 passed, 0 failed, 0 skipped, 0
cancelled. The delivered evidence JSON records the supervisor envelope as exit
0, `blocked: null`, `quiescent: true`; the raw TAP file itself is the child test
output, not a separate supervisor result record. Per the supplied maintenance
handoff, these are maintenance checks—not a tier execution. I did not launch or
rerun a suite.

## Resolved U01–U28 matrix

Statuses below assess the local contract outcome on this snapshot. “Verified”
does not mean live Replit task lifecycle or runtime mirror parity was observed.
`#n` identifies the passing TAP test ordinal in the raw 113-test log; the quoted
test names are the test-level mapping. The handoff's original matrix is retained
in `docs/validation/unified-full-application-handoff.md`.

| ID | Status | Independently resolved evidence and outcome |
|---|---|---|
| U01 | **verified** | `store.mjs:61–74` hashes the canonical `.agents` source against the pin and refuses drift; test #60, “missing context, unknown IDs, edited plans and source drift fail closed.” Archive/source hash equality also observed as above. |
| U02 | **verified** | `AGENTS.md:4–15` and `replit.md:5–45` identify Unified as the sole active new-work gate and label old rules history. Test #88, “superseded alias cannot import the former rules,” and #56 cover legacy separation. |
| U03 | **verified** | `plans.mjs:103–152` creates a random UUID-backed identity, commits reservation before publication and preserves post-reservation failure. `store.mjs:88–101` serializes registry transactions; merge guard preserves prior records. Tests #61 and #69 cover non-reuse and concurrent allocation. No live ID was allocated. |
| U04 | **verified** | `plans.mjs:149–152,164–246` leaves failed publication incomplete and only permits same-reservation completion from exact recorded context. Tests #64–68 cover completion, stale/substituted context, IO failure and concurrent ownership. |
| U05 | **verified** | `merge-guard.mjs:11–79` preserves IDs, tombstones, event/run prefixes and bindings; `:83–103` compares with committed registry. Tests #76 and #108 cover lost records/tombstones, unsupported edits and separate-checkout reconciliation. Current registry hash matches the recorded protected hash; this verifier made no registry change. |
| U06 | **verified** | `unified-tiers.json` defines exactly the four registered tiers; `store.mjs:103–121` validates and resolves inherited steps; `preflight.mjs:88–100` chooses the first tier containing every inspected required step and refuses inadequate coverage. Test #102 exercises selection/refusal. Current tier definitions and inherited step counts are recorded in the evidence JSON; database/browser routes remain unavailable. |
| U07 | **verified** | `plans.mjs:267–286` requires the provisioned status, exact selected/bound tier, unchanged tier hash and sealed plan; `runner.mjs:79–83` admits only after those checks. Test #59 covers all wrong-tier denials and the recorded-tier route. |
| U08 | **verified** | `plans.mjs:311–371` requires a supported amendment, unchanged native identity, rationale, authorization-applicability/evidence-impact notes, target leases, reseal and recorded old/new binding. Tests #70 and #105 cover amendment binding and native identity. These records are not machine-verified approvals; host authorization remains the Agent's responsibility as documented. No task was amended here. |
| U09 | **verified** | `store.mjs:123–139` validates baseline structure and surfaces stale/expired entries as warnings; `runner.mjs:26–38` matches exact suite/test/signature and distinguishes ignored from owned. Tests #85, #87 and #106 cover matching, malformed/ambiguous catalogs and fail-closed behavior. Current catalog was read; it has zero entries, not a proven clean historical baseline. |
| U10 | **verified** | `plans.mjs:69–90` renders ignored/owned declarations, “None known at plan time” and the flaky-test rule; validation checks declarations against the catalog at `:92–101`. Tests #75, #85 and #87 cover rendering/declaration and catalog cases. No entry was added or reclassified. |
| U11 | **verified** | `plans.mjs:103–147` validates candidate, tier, baseline and strict guard before provisioned publication; `preflight.mjs:131–144` distinguishes preview from provisioning. Tests #51–55 and #75 cover required declarations, sealed-plan guards and rejection before admission. |
| U12 | **verified** | `context.mjs:4–20` explicitly says plan context is not an approval receipt; `preflight.mjs:25–33` returns host authorization/lifecycle `NOT_OBSERVED`; `AGENTS.md:53–87` requires Agent-first host checks and disclaims a Start hook/editor lock. Test #94 checks the read-only/host-unobserved result. No platform Start interception is claimed. |
| U13 | **verified** | `context.mjs:6–20`, `plans.mjs:253–286`, and `preflight.mjs:13–33` require exact ID/hash/tier/contract/native identity/sealed text and deny mismatches. Project procedure `unified-preflight-execution.md:64–99` requires supported native publication and full readback. Tests #94, #104 and #105 cover exact context, stale state and native/local mismatch. |
| U14 | **verified** | `context.mjs:27–31` refuses active/uncertain work or a retained target lease; `preflight.mjs:40–53` holds the target lease through awaited work; amendments hold affected target leases and refuse active runs. Tests #78, #82, #103 and #105 cover quiescence and stale resumption. |
| U15 | **verified** | Tests #73 and #108 exercise simulated boot/device changes and fresh/separate-copy inputs; the evidence JSON reports two independent read-only Node processes with matching policy/registry/tier state. The raw process probe transcript was not present for independent replay. No real reboot was performed or claimed. |
| U16 | **verified** | Tests #72 and #108 exercise checked CLI operation at a different checkout path and separate-checkout transport of exact sealed inputs, preserving identity and denying changed/missing context. This verifies the local copy-environment contract, not every platform task-agent environment; actual task-agent launch remains unobserved. |
| U17 | **verified** | `runner.mjs:45–77,129–178` uses bounded supervision, requires observed quiescence for PASS and retains exclusion on uncertainty. Tests #79–82 and #113 cover timeout, detached children, parent death and output bounds; raw log records the full maintenance suite with no skips/cancellations. The evidence JSON records the maintenance supervisor as quiescent. |
| U18 | **verified** | `store.mjs:44–59` implements retained single-flight leases; `runner.mjs:83–84` leases the actual target. Tests #78 and #93 cover same-target exclusion and independent-target concurrency. No live lock was reclaimed. |
| U19 | **verified** | `runner.mjs:108–119` binds retry to the original report, plan/tier hashes and configured isolated test selector; current context is rechecked before run. Tests #86, #87 and #104 cover retry provenance, stale context and filtered/unobserved results. |
| U20 | **verified** | `runner.mjs:26–38,137–154` retains raw failures, allows only exact ignored/self-classified outcomes, and does not accept owned repairs or unexplained failures as PASS. Tests #85 and #87 cover ignored/owned, ambiguous and unobserved cases. |
| U21 | **verified** | `runner.mjs:180–211` requires an observed isolated retry plus separate documented-pattern evidence and labels the inference; it explicitly rejects retry alone as provenance. Test #86, “passing isolated retry is not provenance,” passed. |
| U22 | **verified** | `runner.mjs:139–169` makes blocked/incomplete/fail distinctions from observed result, quiescence, skipped tests and changed gate inputs. Tests #87 and #109 cover unobserved/skipped checks and stale-source invalidation. Maintenance remains explicitly not a tier PASS. |
| U23 | **verified** | `runner.mjs:213–231` requires an authentic resolver and stores owner direction as administrative closure without overwriting assessment; absent adapter fails closed. Test #89 rejects forged authority and overwriting a failed assessment. No administrative closure occurred. |
| U24 | **verified** | `store.mjs:137–139` emits stale/expired baseline warnings rather than execution denial. Test #87 exercises baseline conditions; evidence JSON reports current warnings `[]`. No baseline was changed. |
| U25 | **verified** | Canonical gate-maintenance scope is owner-directed, outside task admission and self-tested. Current diff inspection shows only the guide and the detecting test changed among tracked source files; the executed suite is reported as maintenance. Protected current policy, tier, registry and baseline hashes match the evidence record. No task ID, ledger edit, application code change or tier PASS was produced by this maintenance. |
| U26 | **verified** | `plans.mjs:30–38,267–286,311–371` resolves each record's historical renderer/contract and requires an explicit amendment to adopt current revision. Tests #74 and #107 verify old sealed contracts remain unchanged until amendment. |
| U27 | **verified** | The source diff contains no `.local/tasks` deliverable. `runner.mjs:39–43` constructs a validation environment without credentials, session keys, database URL or `NODE_OPTIONS`; test #83 verifies filtering. No secret values were read or copied. |
| U28 | **verified** | The actual guide now matches current policy and describes the cooperative/native-context limits. Test #112 reads the guide and policy and rejects all three targeted defects. Tests #12, #94 and project instructions retain the real unavailable-capability and host-interception limitations. |

## Separate readiness and routing limitations

| Check | Status | Finding / next action |
|---|---|---|
| Local source and maintenance acceptance | **verified** | U01–U28 local contract outcomes pass on the measured snapshot; no gate defect remains identified. |
| Runtime-visible skill parity | **blocked** | No runtime mirror was inspected. Runtime parity is unverified; a read-only runtime-visible snapshot and comparison would be needed to close that separate evidence track. |
| Actual Replit task-agent launch / live workspace restart | **blocked** | No native task-agent launch or real reboot was performed. Existing different-path, simulated-input and fresh-process evidence is bounded fixture/probe evidence, not platform execution. Platform owner would need to provide an authorized safe observation route if that claim is required. |
| Full operational readiness across tiers | **blocked** | `test-standard-plus` and `test-heavy` require unavailable disposable database/browser routes and fail closed. Their denial is correct gate behavior, not a missing capability to paper over. No such capability or workload was added. |
| Current ordinary tier PASS | **blocked / not claimed** | The 113-test gate/RG run is a supervised maintenance run, not a bound tier. The prior 152-test fast-tier run predates this gate-test edit and is not current evidence. |
| Durable Router verification follow-up | **blocked by routing capability** | This direct gate-only maintenance has no native primary task or dependency. No task ID was invented or created. A report/helper review is not a dependent project task; there is no follow-up task to release or claim as created. |

The project has a zero-entry baseline catalog. Its valid empty state supports the
current “None known at plan time” rendering, but does not establish that the
historical test baseline was clean. Runtime mirror parity, actual native task
lifecycle, and live recovery/resource coverage remain distinct and unverified.
No retired v4, machine-bound, signed-identity, distributed-allocator, or extra
reviewer requirement was imposed.

## Snapshot digests

Measured for this report; SHA-256:

| Input | Digest |
|---|---|
| Canonical Failure Gate skill | `2025d914d570b364dea2e7b8bd9dda35881a9b60ccaca67d9d904060b37f6c22` |
| Canonical attached archive | `e12ef26d91a5f02244b8c54abe278422a242f0451e5965838d0cc13da6c13469` |
| `scripts/failure-gate/store.mjs` | `9e317743f4b1f9818884e6e253a5efec395f0780268057c61cff6c4dcf68f31b` |
| `scripts/failure-gate/plans.mjs` | `21df781853e22808633520b757a018491d1e883b1bb649ecce7bdcfb8822aa80` |
| `scripts/failure-gate/runner.mjs` | `daf5521280e6065914c101e759705dd48feddd20d506d6234649a8bbae917990` |
| `scripts/failure-gate/preflight.mjs` | `473074e0af34bed9db4dda94e258fc6613640db417a7905dd7a5e7e97c1c630c` |
| `scripts/failure-gate/context.mjs` | `059feb64bbb2640227212b5cbc40acc8a8f6ba8317e0d41ef23412f9868e4b8f` |
| `scripts/failure-gate/merge-guard.mjs` | `357c7e2e5997428757e837e56a1b9e88583c7e0c2ee65ae8f129799b06f6de37` |
| `scripts/failure-gate/cli.mjs` | `e1d949d70b3c6aea7229e51d3c5155f9fc560b36162709ab5485a40d5718d7af` |
| `scripts/failure-gate/execution-sources.mjs` | `fbf9dd3dd30b6ecdc48c839d41af3bfdabdf9a46d8b6f101ef23e48797662796` |
| `scripts/failure-gate/verification.mjs` | `89f246a19d8933f0040a4573f06f851de7844bf285b45691d2a17cce5e7544c3` |
| `scripts/failure-gate/supervisor.py` | `98770c9d377093f91c63a445453ace0e02022bd127e47d4cdca5e3a4b58c0851` |
| `scripts/tests/failure-gate.test.mjs` | `99266925a4943e2931297cb1af1dc5f71faf158d38ab49e470b85a324ad473fc` |
| `scripts/tests/check-regression-guard.test.mjs` | `b455d21d1637306fffc86cc9bfef264f67ee8754158338d6701ab7647ba41f7c` |
| `docs/validation/unified-local-execution.md` | `46856d50c95b8e7213932dd86d43e7e001477ca9ae33ae2e41b705c45f3c18da` |
| `docs/validation/unified-policy.json` | `6a59bad4c1ad86cb18d3fa3161643047b023dbe2b39e8e37a8a24198d72ad583` |
| `docs/validation/unified-tiers.json` | `8e32725168fa9d2cc0b878a03916958816cf72815aafda6f9ee44814706d2162` |
| `docs/validation/failure-baseline.json` | `352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871` |
| `docs/validation/unified-task-registry.json` | `292746b2408e16b8c04b0feb35bc1506864748cef396218ac50e446d034da49b` |
| `docs/validation/unified-full-application-handoff.md` | `e02c87573642b28f3df840658edd8a962fecba7dfe16f64ca8a1c957dc3c1f43` |
| `docs/validation/evidence/unified-full-application.json` | `3e177784b2af501fb0f9fe1ade8411d9eb0ec6ef1c1360bf01e4bcf014a8eb75` |
| `.local/unified-full-application/gate.log` | `a7b3b85dc9f463defe8eb0c1098c9149f78c796a0ad461f003d053b714cbd8e1` |

Combined SHA-256 manifest for the gate implementation files above, both gate
test files and the changed authoring guide (sorted `sha256sum` records):
`bfd005ef195ae8e7b132860204c9e1ef7916b3870a5675f33961e74dc50a54e8`.

The handoff and evidence JSON hashes above are measured report-input digests;
their historical before/after assertions are identified as installer-recorded
where independent historical raw snapshots were unavailable.
