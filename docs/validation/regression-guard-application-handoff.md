# Regression Guard application handoff

## Identity, authority and status

- Project: `/home/runner/workspace`, stable identity
  `4b60cdc8-3fdb-439e-b554-21dd7e77a03e`.
- Operation: **Apply contract**, exact skill ID `regression-guard`.
- Primary: Replit native task **39**, “Fully apply Regression Guard enforcement”.
  Committed assignment readback: `.local/tasks/task-39.md`, SHA-256
  `7e6d2de486a5aab88a81937f70a2e24db27cc15878d35e2699208b341cbe03de`.
  The environment-local file is not a source deliverable or a Unified ID.
- Canonical Regression Guard source:
  `.agents/skills/regression-guard/SKILL.md`, SHA-256
  `fcda16a9910a91e1ace9933651acdf69d252766948bd379ee1bc5ee6a72f2031`.
- Required companion: `.agents/skills/failure-gate-unified/SKILL.md`, SHA-256
  `73254fc29ec62a3966fd16508ec20dcac6cc676f65fa309a5365d400dcccf2cc`.
  Both definitions and the existing companion revision pin are unchanged.
- Authorization: the assigned owner-directed gate-maintenance plan under
  Unified's gate-work exception. No live Unified ID was allocated, no live
  binding/ledger record was changed and no tier PASS is claimed.
- Delivery: scoped checker/plan-route changes and instructions implemented;
  maintenance **63/63 passing**, independent verification **pending**.
  CLI deferral acceptance is **blocked** without an authentic host adapter.
  This is not an unqualified claim of semantic or platform enforcement.
- Catalog status: **changed** per original baseline. Canonical source remains
  authoritative; no catalog, runtime mirror or skill-definition repair occurred.

## Original baseline

Starting implementation revision:
`beff45921263e72c41944027eab920c081f92273`, clean tree at initial inspection.

| Starting file | SHA-256 |
| --- | --- |
| `scripts/check-regression-guard.mjs` | `76db5e02fe3b1d42b453087d15ac1e02f4dd98539f42634dafae883ff939a265` |
| `scripts/failure-gate/plans.mjs` | `6a6dc98267498f96470a0e7e5605dc22d726d47c956ae549d6c5a6aa46d6d135` |
| `scripts/failure-gate/runner.mjs` | `f53b921e3f8d8c97dfc0c2e785d7f6f11339c2e01197003b6b5283db849dce7d` |

Confirmed defects owned here, not ignored: a test-oriented title suppressed an
authorization fix; “This is not purely additive” suppressed an authorization
fix; normal-only rendering; no strict Regression Guard call in provisioning or
bound `checkPlan`. The starting 53 maintenance tests passed but missed these.
The baseline catalog was schemaVersion 1 with empty entries; no known scoped
failures were excluded. Historical lack of platform task interception and an
authentic host acceptance adapter were limitations, not newly reproduced bugs.

## Delivered implementation snapshot

The tested snapshot is the starting revision plus the following gate source
digests. A later merge commit may differ in metadata; rediscover source content,
do not substitute a task label or old test log for snapshot equality.

| Delivered file | SHA-256 |
| --- | --- |
| `scripts/check-regression-guard.mjs` | `5122f0ba2183b58726e8106d470f562e51f4d654357d0233c6c7666f3a53aef3` |
| `scripts/failure-gate/plans.mjs` | `cc5de4338c3ec379bb142d317fcd708abfc1cd76f719c1f9eff34ee923449c4c` |
| `scripts/failure-gate/runner.mjs` (unchanged) | `f53b921e3f8d8c97dfc0c2e785d7f6f11339c2e01197003b6b5283db849dce7d` |
| `scripts/failure-gate/cli.mjs` | `37e55b9673c50a13febe4a63bbf5525af6fe91071eba1c020b50b264d1026bd0` |
| `scripts/failure-gate/merge-guard.mjs` | `16f394ac20d37861c49b050aa1a76388231d78ecc67c2df7aa78ea8b2f57b017` |
| `scripts/failure-gate/execution-sources.mjs` | `c978346dd3119ee365cc5a047718bfea898aab1d9bafe1ba567aa6e904a62adc` |
| `scripts/tests/check-regression-guard.test.mjs` | `d6c3579d879a99955b12fef3994f31fb7f8e1713aecc20f1739c20d04a3309d8` |
| `scripts/tests/failure-gate.test.mjs` | `fbe82f3bb04f98510ccc0319e7623eacd6aa57180868ac6c090770f81596d0f3` |
| `docs/validation/unified-policy.json` | `b451d03e85b22982191034368f274d04b35f2242c9395d8eab6452f240bd4b20` |

Preserved control inputs, also checked with an empty `git diff`:

| File | Unchanged SHA-256 |
| --- | --- |
| `docs/validation/unified-task-registry.json` | `acf9b47326d4fcaa4c0b6690f9ce252f2e3f1d0f749493bf0226bf80f4fed800` |
| `docs/validation/unified-tiers.json` | `9c52ad407a61f1acf0a7a958e6b1e154ad9427a45d6958a8b266ea77188d3f97` |
| `docs/validation/failure-baseline.json` | `352892da28d8320bb6fcaa1d482bba8eecd9510786f3baf464e0b7343a57b871` |

Additional delivered instructions: `AGENTS.md`, `replit.md`,
`docs/validation/unified-local-execution.md`,
`docs/validation/regression-guard-authoring.md`, this handoff and
`docs/validation/regression-guard-verification-plan.md`.
No application, package, workflow, database, provider or deployment file changed.

## Original-to-actual mutation and entry-point map

| Planned obligation | Actual delivery |
| --- | --- |
| Correct the checker without replacing its three modes | Bounded material-mutation and semantic-risk precedence; negated exclusions cannot grant exemption; stronger specificity/N/A checks; stubs-only ignores filled structural duplicates; honest I/O failures; sealed repair refused. |
| Complete authoring without rewriting sealed history | Policy adds only `newPlanTemplate: unified-v3`; each new record records its representation separately from the unchanged contract pin/mapping. Historical render strings remain unchanged. |
| Support normal/N/A/self/excluded | v3 validates variant-specific fields and complete host sections, then generates them before strict checking and sealing. |
| Enforce provisioning, amendment, validation and execution | `provision` and `amend` call the shared strict single-plan checker before publication/replacement. `checkPlan` calls it after seal/binding checks. Existing runner admission passes inherit it before launch, so `runner.mjs` did not need mutation. |
| Preserve transaction and amendment safety | A rejected post-reservation plan retains an incomplete ID without publishing Markdown. An invalid replacement is checked before invalidation or writes. Supported amendment can replace a historically sealed declaration newly rejected by lint, after checking its identity/hash/binding. |
| Capture accepted-reference evidence | Programmatic provision/amend accept trusted host-code `resolveTask`, verify project/ref/non-draft state/reference and record plan-write-time evidence. CLI has no authentic adapter and rejects deferral rather than believing prose/JSON. |
| Keep evidence and sealed evolution coherent | Merge guard permits representation/deferral evidence changes only with the existing amendment event. Execution source manifest now also fingerprints the canonical Regression Guard definition. |
| Planner/executor semantic obligations | Explicit instructions and example in AGENTS/authoring guide; scenario-to-test/assertion delivery evidence is required. No claim that lint proves semantics. |

Supported paths: `new-plan.mjs` → `provision`;
`amend-plan.mjs` → `amend`; `check-failure-gate.mjs` and
`validate-task-plans.mjs` → `checkPlan`;
`run-validation.mjs`, `validation-tier.mjs`, package tier aliases and retry
admission → runner → `checkPlan`. Standalone Regression Guard strict mode
retains `TASK_PLAN_FILE` selection; editable legacy repair is not reactivated
for Unified. All gate-fixture allocations used disposable temporary roots.

## Pinned obligations and delivery evidence

Evidence references below are reproducible test names in the two scoped suites,
not independent acceptance. Semantic/manual checks remain explicit.

| ID / canonical lines | Delivered evidence and residual assessment |
| --- | --- |
| RG-01 / 37–134, 239–261 | Checker tests “material mutations override test titles, negated and unrelated exclusions”, “legitimate exclusions survive incidental risk words and unchanged clauses”, and eight “material risks phrased without trigger keywords”; AGENTS lists all eight categories. Bounded syntax is not general natural-language classification; planner semantic review remains required. |
| RG-02 / 138–165 | Exact fields, duplicates, missing/empty fields, placement, active headings, fences and quotes covered by checker fixtures; v3 authoring test checks all host sections and normal rendering. |
| RG-03 / 169–214 | Four allowed-reason fixtures; “N/A rejects ordinary live API and race difficulty…” plus invalid N/A/mixed-declaration fixtures. Facts of impossibility require review; existing coverage uses a named normal declaration. |
| RG-04 / 218–235 | Authoring/amendment matrix covers self mode; mixed material fixtures reject it despite test titles. Concrete test/guard deliverable is required; real primary-deliverable truth is reviewed, not proven by regex. |
| RG-05 / 265–287 | “deferrals require authoritative project/ref/non-draft evidence at each plan write” rejects wrong project/ref, unverified, draft, cancelled and missing-reference data; tests accepted provision/amend and renewal failure without evidence. Offline lint cannot prove host state. Real CLI adapter absent: CLI deferral capability blocked, not passed. |
| RG-06 / 291–316 | Exact chat line, comma-separated example and before-heading obligation in AGENTS/authoring guide. Checker does not see chat; no historical announcement audit claimed. |
| RG-07 / 320–338 | Strict successes/failures; fix-stub insertion/no-op/idempotence/preservation; stubs-only placeholders and grandfathered missing/filled structural errors; unknown/conflicting modes; injected read/write errors fail honestly. |
| RG-08 / 340–351 | Both guard entry points test empty, missing, non-md and directory targets; no-ID summary cannot ignore a selected plan. Relative checker paths preserved. Sibling/archive/sealed bytes checked in gate fixtures. |
| RG-09 / 353–369 | v3 generation → strict → sealing; amendment preflight; all execution routes reject invalid sealed declarations with no repair/workload/report. Historical v1/v2 rendering and revision behavior tested. Direct fix-stub sealed repair rejected. |
| RG-10 / 376–394 | Placeholder, field-count and basic specificity checks; concrete future test file accepted without existence requirement. Same-layer/assertion quality is a planner/executor review obligation documented with examples, not a syntactic guarantee. |
| RG-11 / 398–414 | Existing exact Validation-template fixture, unchanged tier/workload hashes, all-four-tier binding fixtures, same-tier declaration amendments and historical baseline suites coexist. No escalation, live tier run or workload changes. |
| RG-12 / 29–33 | Executor scenario → delivered test → assertion/result table mandated in AGENTS/guide; concrete delivery for this maintenance is recorded below. Independent verifier must assess semantic claims, not infer fulfillment from lint success. |

## Delivered guard-to-scenario record

| Scenario | Actual guard/test | Assertion and observed maintenance result |
| --- | --- | --- |
| A test-oriented title hides an authorization fix | checker suite: “material mutations override test titles, negated and unrelated exclusions” | Missing guard exits 1; Self-satisfying replacement also rejected. Passed. |
| “not purely additive” hides an authorization fix | same matrix | Missing guard exits 1, unlike reproduced starting exit 0. Passed. |
| Invalid generation/amendment publishes or rewrites protected content | gate suite: “invalid new declarations cannot publish…” | Generation retains incomplete IDs with no published plan; amendment retains sealed and registry bytes plus sibling content. Passed. |
| A current invalid declaration launches a workload | gate suite: “current strict check blocks sealed invalid declarations at all execution routes…” | Direct/CLI admission rejects; no launch marker, run directory or registry mutation; archive/sealed bytes unchanged. Passed. |
| New representation invalidates historical seals | gate suite: “new representation does not reinterpret historical renderer or contract mappings” and older-contract fixture | Old seal and record unchanged; explicit same-ID amendment adopts new representation. Passed. |
| Deferral trusts a proposed task or acceptance prose | gate suite: “deferrals require authoritative project/ref/non-draft evidence…” | Untrusted/mismatched/proposed inputs rejected; trusted adapter evidence captured on each write. Passed with fixture adapter only. |
| I/O failure falsely reports stub success | checker suite: “fix-stub refuses sealed repairs and reports actual read/write failures honestly” | Injected read/write exceptions exit 1, no success output and no mutation. Passed. |

These assertions live at the affected Node checker/gate layer and demonstrably
reject the known recurrence inputs. No application behavior or browser layer
was changed.

## Observed maintenance

Executed 2026-10-17 under Node `v24.13.0`, Python `3.13.11`, Linux/Nix.
Relevant inputs: mode active, new representation v3, unchanged canonical pin,
no new capability strings. Fixtures use temporary roots, an inherited PATH/HOME
and sanitized child environments; no credential values were read or recorded.
No browser/database/provider configuration was needed.

```sh
timeout --signal=TERM --kill-after=5s 180s \
  node --test --test-reporter=tap --test-timeout=45000 \
  scripts/tests/check-regression-guard.test.mjs \
  scripts/tests/failure-gate.test.mjs
```

Observed exit **0**, **63 tests, 63 pass, 0 fail/cancelled/skipped/todo**,
14.02 seconds. Earlier coherent maintenance passes: 61/61 before the final
sealed-repair, I/O and deferral-evidence coverage changes, and 63/63 before
the explicit unchanged-trigger error-copy fixture. No passing retry is
being used to classify a failure as pre-existing; neither run failed.

Raw final TAP: `generated-artifacts/regression-guard/maintenance.tap`
(ignored generated output, not promised to survive checkout), SHA-256
`4caf6f2da4e33482cec914b74eedb9e3089bea0228f3042c27d741bf3e6febf2`.
The tracked tests, exact command, source manifest and observed result above
are the durable evidence; the verifier must independently inspect/rerun as
authorized rather than assume this local log exists.

Only one top-level maintenance process ran at a time. Fixtures include timeout,
TERM-ignoring workload, detached-descendant and killed-parent cleanup assertions.
After completion a targeted process listing found no matching maintenance
test process or disposable gate supervisor/workload. No app services were
started, restarted or stopped; browser screenshots are not applicable to this
gate-only work. No remote CI or post-merge hook ran.

## Deviations, limitations and separate verification

1. Representation evolution is separate from canonical contract revision,
   because changing the old revision-to-renderer mapping would invalidate
   existing sealed bytes. No historical record or pin was rewritten.
2. Strict enforcement is shared in-process for provision/check/amend, not a
   subprocess archive scan. CLI checker uses the same pure strict core; the
   selected/generated single plan is the only checker input.
3. Authentic host acceptance remains unavailable to the CLI. Trusted adapter
   behavior is fixture-verified; **live acceptance integration is not claimed**.
   Offline lint alone is never acceptance evidence.
4. Broad natural-language understanding, assertion quality, N/A truth and test
   delivery cannot be proved mechanically. Those are cooperative agent duties
   and independent review items, not waived requirements.
5. Project scripts cannot control Replit platform plan publication, native task
   lifecycle or completion. No automatic completion interception, tamper-proof
   guarantee or remote CI enforcement is claimed.
6. No bulk archive audit, retroactive admission, actual host reboot or production
   task-environment verification ran. Existing isolation/restart fixtures are
   simulated evidence only. Workload definitions and unavailable higher-tier
   capabilities are unchanged.

Independent read-only verification is specified in
`regression-guard-verification-plan.md`, using the same fixed RG-01–RG-12
obligations. This primary does not perform or accept that verification.
The executor should reconcile actual delivered digests and host evidence,
classify differences (expected implementation change, method correction,
material scope change, defect, unresolved item), and publish
`docs/validation/regression-guard-verification.md`. Proposed follow-ups are
not accepted tasks or completed verification.

Follow-up readback: native **42** was created as PROPOSED with a real
`dependsOn: ["#39"]` relationship and the complete RG-01–RG-12 verification
summary, primary/source identities, tracked plan, report path, safety rules and
duplicate-key reference. Native **43** was created as PROPOSED, also depending
on 39, for discovery/integration of authentic CLI acceptance evidence.
Neither was activated or represented as accepted/verified. The primary-plan
digest remains the binding above; the verifier must recheck it at execution.
