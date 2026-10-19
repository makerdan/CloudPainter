import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { provision, checkPlan, amend, cancel, render, regressionPreflight } from "../failure-gate/plans.mjs";
import { run, parseFailures, evaluateFailures, selfClassify, closeOwnerDirection } from "../failure-gate/runner.mjs";
import { registry, readJson, atomicJson, lease, sha, TIERS, baseline, warnings, safePath, policy, tier } from "../failure-gate/store.mjs";
import { transaction } from "../failure-gate/store.mjs";
import { recoveryPreview } from "../failure-gate/recovery.mjs";
import { assertRegistryEvolution } from "../failure-gate/merge-guard.mjs";
import { RG_REVISION, assessRegression, assertRegressionWorkload, CATEGORIES } from "../failure-gate/regression-contract.mjs";
import { preflight, prepare, dispatch, sealedInputs } from "../failure-gate/preflight.mjs";

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.REPL_ID ??= "private-fixture";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (root, file, value) => atomicJson(root, file, value);
const context = (root, id) => registry(root).records[id].planPath;
const spec = (tier = "test-fast", extra = {}) => ({
  title: "Private fixture task", tier, why: "Exercise the fixture's bounded command",
  coverageEvidence: "docs/validation/unified-tiers.json fixture work; node scripts/run-validation.mjs ID " + tier,
  what: "Verify local gate invariants using disposable files only.",
  done: ["A mismatched binding cannot launch work."],
  outOfScope: ["Application behavior and live data."],
  steps: ["Exercise disposable gate fixtures and retain maintenance evidence."],
  relevantFiles: ["scripts/tests/failure-gate.test.mjs"],
  regression: { covers: "Wrong-tier execution and lost task identity", testLocation: "scripts/tests/failure-gate.test.mjs", checks: "Rejects mismatched tiers before child launch and retains allocated identities." },
  baselines: [], ...extra,
});
function fixture(t, work = 'console.log("ok")', adapter = "exit") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloudpainter-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.cpSync(path.join(SOURCE, "scripts/failure-gate"), path.join(root, "scripts/failure-gate"), { recursive: true });
  for (const entry of ["new-plan", "run-validation", "check-failure-gate", "check-regression-preflight", "check-unified-preflight", "prepare-plan", "dispatch-implementation", "amend-plan", "validation-tier", "validate-task-plans", "check-regression-guard"]) {
    fs.copyFileSync(path.join(SOURCE, "scripts/" + entry + ".mjs"), path.join(root, "scripts/" + entry + ".mjs"));
  }
  fs.mkdirSync(path.join(root, ".agents/skills/failure-gate-unified"), { recursive: true });
  const canonical = fs.readFileSync(path.join(SOURCE, ".agents/skills/failure-gate-unified/SKILL.md"));
  fs.writeFileSync(path.join(root, ".agents/skills/failure-gate-unified/SKILL.md"), canonical);
  json(root, "docs/validation/unified-policy.json", {
    schemaVersion: 1, mode: "active", projectId: process.env.REPL_ID,
    allocatorAuthorityVerified: true, canonicalSource: ".agents/skills/failure-gate-unified/SKILL.md",
    canonicalSha256: sha(canonical), planTemplates: { [sha(canonical)]: "unified-v2" }, newPlanTemplate: "unified-v3",
    capabilities: [], legacyNativeTasks: [{ ref: "#2" }]
    , regressionGuard: { current: RG_REVISION, contracts: {
      [sha(canonical) + "/legacy-v1"]: "legacy-v1",
      [sha(canonical) + "/unified-v2"]: "legacy-v1",
      [sha(canonical) + "/unified-v3"]: "legacy-v1",
      [sha(canonical) + "/unified-v4"]: RG_REVISION,
    } }
  });
  json(root, "docs/validation/unified-task-registry.json", { schemaVersion: 1, projectId: process.env.REPL_ID, revision: 0, records: {} });
  json(root, "docs/validation/failure-baseline.json", { schemaVersion: 1, entries: [] });
  const tiers = {};
  for (const name of TIERS) tiers[name] = {
    target: "fixture-repository", timeoutMs: 7000, stepTimeoutMs: 4000, cleanupMs: 600, requires: [],
    steps: [{ name: "work", cwd: ".", adapter, argv: adapter === "node-tap" ? ["node", "--test", "--test-reporter=tap", "work.mjs"] : ["node", "work.mjs"],
      retryPrefix: ["node", "--test", "--test-reporter=tap", "--test-name-pattern"], retrySuffix: ["work.mjs"] }]
  };
  json(root, "docs/validation/unified-tiers.json", { schemaVersion: 1, tiers });
  fs.writeFileSync(path.join(root, "work.mjs"), work);
  return root;
}
function cli(root, name, args, extra = {}) {
  return spawnSync(process.execPath, [path.join(root, "scripts/" + name + ".mjs"), ...args], {
    cwd: root, encoding: "utf8", timeout: 10000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, REPL_ID: process.env.REPL_ID, ...extra }
  });
}
const failureWork = `import test from "node:test"; import assert from "node:assert/strict"; test("known failure", () => { assert.fail("stable fixture failure"); });`;
test("Runtime Safety registration preserves the entire prior table and inherits exact commands once", t => {
  const before = readJson(SOURCE, "docs/validation/evidence/runtime-tiers-before.json");
  assert.equal(sha(JSON.stringify(before)), "96320bc7e7cfbb05ac37418bdbb3f90f4c4e8ce8dccf31da859ab089437ea644");
  // Pin the delivered Runtime Safety boundary; later authorized tier additions
  // are checked against this complete snapshot by their own delta fixtures.
  const after = readJson(SOURCE, "docs/validation/evidence/ci-tiers-before.json");
  assert.equal(sha(JSON.stringify(after)), "58f3ec04fe58a55f769a55956e631116832fccfb6f1795e23d9d0ec4c06cd4ea");
  const expected = [
    ["runtime-port-policy", "scripts/tests/runtime-port-policy.test.mjs", 15000],
    ["runtime-lifecycle", "scripts/tests/runtime-lifecycle.test.mjs", 60000],
    ["runtime-port-scan", "scripts/check-runtime-ports.mjs", null],
  ].map(([name, file, timeout]) => timeout ? {
    name, cwd: ".", adapter: "node-tap",
    argv: ["node", "--test", "--test-reporter=tap", `--test-timeout=${timeout}`, file],
    retryPrefix: ["node", "--test", "--test-reporter=tap", `--test-timeout=${timeout}`, "--test-name-pattern"],
    retrySuffix: [file],
  } : { name, cwd: ".", adapter: "exit", argv: ["node", file] });
  const names = expected.map(s => s.name);
  const delta = after.tiers["test-standard"].steps.filter(s => names.includes(s.name));
  assert.deepEqual(delta, expected);
  const unchanged = structuredClone(after);
  unchanged.tiers["test-standard"].steps = unchanged.tiers["test-standard"].steps.filter(s => !names.includes(s.name));
  assert.deepEqual(unchanged, before);
  const root = fixture(t);
  json(root, "docs/validation/unified-tiers.json", after);
  for (const name of TIERS) {
    const effective = tier(root, name);
    for (const required of expected) {
      assert.deepEqual(effective.steps.filter(s => s.name === required.name), name === "test-fast" ? [] : [required]);
    }
    assert.equal(effective.hash, sha(JSON.stringify(after)));
    assert.notEqual(effective.hash, sha(JSON.stringify(before)));
  }
});

test("Runtime Safety changed whole-table context refuses old work until supported amendment without rewriting history", async t => {
  const root = fixture(t);
  const before = readJson(SOURCE, "docs/validation/evidence/runtime-tiers-before.json");
  const after = readJson(SOURCE, "docs/validation/evidence/ci-tiers-before.json");
  assert.equal(sha(JSON.stringify(after)), "58f3ec04fe58a55f769a55956e631116832fccfb6f1795e23d9d0ec4c06cd4ea");
  json(root, "docs/validation/unified-tiers.json", before);
  const historical = provision(root, spec());
  const id = provision(root, spec("test-standard"));
  const sealedBefore = fs.readFileSync(path.join(root, context(root, id)), "utf8");
  const history = JSON.stringify(registry(root).records[historical]);
  const ledgerBefore = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
  json(root, "docs/validation/unified-tiers.json", after);
  for (const wrong of ["test-fast", "test-standard-plus", "test-heavy"]) {
    await assert.rejects(run(root, id, wrong, context(root, id)), /Wrong contract/);
  }
  await assert.rejects(run(root, id, "test-standard", context(root, id)), /definition changed/);
  assert.equal(fs.readFileSync(path.join(root, context(root, id)), "utf8"), sealedBefore);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), ledgerBefore);
  amend(root, id, "test-standard", "Owner-covered exact Runtime Safety workload addition", spec("test-standard"));
  checkPlan(root, id, "test-standard", context(root, id));
  assert.equal(JSON.stringify(registry(root).records[historical]), history);
  assert.notEqual(registry(root).records[id].tierHash, registry(root).records[historical].tierHash);
  // Removing even one command or replacing it with a successful alias/subset changes
  // the entire definition and cannot use the amended context.
  for (const mutation of ["omit", "alias"]) {
    const changed = structuredClone(after);
    if (mutation === "omit") changed.tiers["test-standard"].steps.shift();
    else changed.tiers["test-standard"].steps[0].argv = ["node", "-e", "process.exit(0)"];
    json(root, "docs/validation/unified-tiers.json", changed);
    await assert.rejects(run(root, id, "test-standard", context(root, id)), /definition changed/);
  }
  assert.equal(JSON.stringify(registry(root).records[historical]), history);
  assert.equal(fs.existsSync(path.join(root, ".local/failure-gate/runs")), false);
});
async function waitFor(check, limit = 4000) {
  const end = Date.now() + limit;
  while (!check()) {
    if (Date.now() > end) throw new Error("Fixture observation deadline exceeded");
    await delay(25);
  }
}
function alive(pid) {
  try {
    const state = fs.readFileSync("/proc/" + pid + "/stat", "utf8").split(") ")[1][0];
    return state !== "Z";
  } catch { return false; }
}

function currentFixture(t, work = 'console.log("ok")') {
  const root = fixture(t, work);
  fs.cpSync(path.join(SOURCE, ".agents/skills/regression-guard"),
    path.join(root, ".agents/skills/regression-guard"), { recursive: true });
  const p = policy(root);
  p.newPlanTemplate = "unified-v4";
  json(root, "docs/validation/unified-policy.json", p);
  return root;
}
function currentSpec(extra = {}) {
  const scenario = "An invalid current declaration is offered for admission to the gate.";
  const assertion = "Assert rejection before the workload sentinel exists and retain the prior sealed bytes.";
  const layer = "backend gate admission and execution boundary";
  const location = "work.mjs";
  return spec("test-fast", {
    title: "Repair current gate admission",
    what: "Change existing admission behavior to reject invalid declarations before execution.",
    regression: { mode: "normal", covers: scenario, testLocation: location, checks: assertion },
    regressionAssessment: {
      classification: "material",
      rationale: "Existing admission and execution contracts materially change for current plans.",
      scopeReview: "Reviewed requested scope, Steps and existing admission behavior for every material component.",
      coverageReview: "The boundary fixture asserts refusal before child launch, rather than merely inspecting syntax.",
      risks: [{ id: "admission", category: "compatibility-contract",
        change: "Invalid current declarations must not publish or launch any validation workload.", layer }],
      coverage: [{ risk: "admission", scenario, testLocation: location, assertion, layer }],
    }, ...extra,
  });
}

test("current RG maps all eight material categories and future/existing tests through CLI publication and amendment", t => {
  const root = currentFixture(t);
  for (const category of CATEGORIES) {
    const input = currentSpec();
    input.regressionAssessment.risks[0].category = category;
    if (category === "bug-fix") {
      input.regression.testLocation = "future/not-created.test.ts — rejects invalid admission";
      input.regressionAssessment.coverage[0].testLocation = "future/not-created.test.ts";
    }
    json(root, "current.json", input);
    const created = cli(root, "new-plan", ["current.json"]);
    assert.equal(created.status, 0, created.stderr);
    const id = created.stdout.trim();
    const record = registry(root).records[id];
    assert.equal(record.planTemplate, "unified-v4");
    assert.equal(cli(root, "check-failure-gate", [id], { TASK_PLAN_FILE: record.planPath }).status, 0);
    assert.equal(cli(root, "validate-task-plans", [], { TASK_PLAN_FILE: record.planPath, UNIFIED_TASK_ID: id }).status, 0);
    assert.equal(cli(root, "check-regression-guard", [], { TASK_PLAN_FILE: record.planPath }).status, 0);
    assert.equal(cli(root, "amend-plan", [id, "test-fast", "Preserve complete mapped recurrence coverage", "current.json"]).status, 0);
  }
});

test("current RG admits factual N/A for all four categories and whole-scope self/exclusions without normal fields", t => {
  const root = currentFixture(t);
  const variants = [];
  const reasons = {
    "real-timing": "This race condition depends on real wall-clock concurrency which cannot be reproduced by deterministic ordering at the affected boundary.",
    external: "This external service behavior is unmockable and cannot be faithfully reproduced at the affected boundary.",
    visual: "This is a purely visual regression; no applicable screenshot or pixel-diff capability exists for the affected rendering.",
    removed: "The affected feature is entirely removed with no surviving code path or material side effect to guard.",
  };
  for (const [category, why] of Object.entries(reasons)) {
    const input = currentSpec({ regression: { mode: "na", why } });
    input.regressionAssessment.coverage = [];
    input.regressionAssessment.exception = { category, risks: ["admission"],
      facts: "Disposable semantic fixture: the named boundary is absent from all available automation capabilities.",
      alternatives: "Reviewed deterministic scheduling, dependency substitution and narrower boundary assertions; none faithfully represents this fixture.",
      residualRisk: "Manual boundary inspection remains necessary; no automated recurrence guard result is asserted." };
    variants.push(input);
  }
  for (const [exclusion, what, rationale] of [
    ["additive", "Add a purely additive independent panel without changing existing behavior.", "Only an independent new panel is added; existing behavior and contracts stay unchanged."],
    ["cosmetic", "Reword an error message without changing when or whether it fires.", "Copy-only rewording has no material accessibility, privacy or contract effect."],
    ["internal", "A genuinely non-material internal refactor with no behavior change.", "Only equivalent local helper names change; no user or supported contract is affected."],
    ["deletion-marked", "This task is marked for deletion.", "This task is marked for deletion and will not be implemented or executed."],
    ["test-only", "Add tests for existing authorization failures without changing existing behavior.", "Only assertions for unchanged authorization are added; no material behavior is changed."],
  ]) variants.push(currentSpec({ title: "Document scope disposition", what,
    regression: { mode: "excluded", reason: rationale },
    regressionAssessment: { classification: "excluded", exclusion, rationale,
      scopeReview: "Reviewed the whole requested implementation scope, not the task title or file extension.",
      coverageReview: "No existing material behavior changes; ordinary host test obligations remain unchanged.",
      risks: [], coverage: [] } }));
  variants.push(currentSpec({ title: "Verify existing coverage", what: "The entire scope is verification-only checks for unchanged behavior; no material change.",
    regression: { mode: "self", deliverable: "scripts/tests/failure-gate.test.mjs — existing rejection case asserts the workload sentinel stays absent." },
    regressionAssessment: { classification: "self",
      rationale: "The entire scope verifies the existing check; no admission implementation changes are included.",
      scopeReview: "Read all requested changes and confirmed implementation is limited to the check itself.",
      coverageReview: "The existing rejection case is the deliverable, not a promise of an unimplemented check.",
      risks: [], coverage: [] } }));
  const id = provision(root, currentSpec());
  for (const input of variants) {
    let created;
    try { created = provision(root, input); } catch (error) {
      throw new Error(`Declaration variant ${input.regression.mode}/${input.regressionAssessment.exclusion ?? input.regressionAssessment.exception?.category}: ${error.message}`);
    }
    checkPlan(root, created, "test-fast", context(root, created));
    amend(root, id, "test-fast", "Adopt a factual whole-scope declaration disposition", input);
    const record = checkPlan(root, id, "test-fast", context(root, id)).record;
    assert.deepEqual(record.spec.regression, input.regression);
  }
});

test("current RG rejects title/metadata escapes, unmatched layers, missing risks and non-detecting declarations transactionally", t => {
  const root = currentFixture(t);
  const id = provision(root, currentSpec());
  const sibling = provision(root, currentSpec());
  const before = fs.readFileSync(path.join(root, context(root, id)), "utf8");
  const siblingText = fs.readFileSync(path.join(root, context(root, sibling)), "utf8");
  const invalid = [];
  for (const [title, what] of [
    ["DELETE: remove old flow", "Remove existing authorization checks for protected tenant records."],
    ["Add tests for admission", "Change existing admission so invalid declarations execute workloads."],
    ["Add a checker", "The primary deliverable is a checker. Also change existing execution behavior."],
    ["Add an independent panel", "This is not purely additive. Fix stale record overwrites."],
    ["Update internal docs", "Fix existing authorization.\n\nThis string cannot enter the supported one-line inputs."],
    ["Add an independent panel", "Add a purely additive panel. Also replace existing supported serialization."],
    ["Reword error copy", "Cosmetic wording only. Also change retry logic for existing failures."],
  ]) {
    const input = currentSpec({ title, what, regression: { mode: "excluded", reason: "Claims no material changes despite actual executing scope." } });
    Object.assign(input.regressionAssessment, { classification: "excluded", exclusion: "additive", risks: [], coverage: [] });
    invalid.push(input);
  }
  for (const mutate of [
    i => { i.regressionAssessment.coverage = []; },
    i => { i.regressionAssessment.coverage[0].layer = "unrelated frontend store boundary"; },
    i => { i.regressionAssessment.coverage[0].assertion = "It works"; },
    i => { i.regressionAssessment.risks.push({ ...i.regressionAssessment.risks[0], id: "privacy", category: "security-privacy" }); },
    i => { i.regressionAssessment.rationale = "TODO"; },
    i => { i.regressionAssessment.risks[0].category = "arbitrary"; },
    i => { i.regression.mode = "self"; delete i.regression.covers; delete i.regression.testLocation; delete i.regression.checks; i.regression.deliverable = "scripts/tests/failure-gate.test.mjs — test current rejection behavior."; },
    i => { i.regression.checks = "Tests the fix using all available cases"; },
    i => { i.regression.testLocation = "tests/"; },
    i => { i.regression = { mode: "na", why: "The race is hard to test without a screenshot." }; },
    i => { i.regression = { mode: "na", why: "This race condition uses real wall-clock timing which cannot be reproduced deterministically." }; },
  ]) { const input = currentSpec(); mutate(input); invalid.push(input); }
  for (const input of invalid) {
    const ledger = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
    assert.throws(() => amend(root, id, "test-fast", "Invalid candidate must preserve prior admitted revision", input));
    assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), ledger);
    assert.equal(fs.readFileSync(path.join(root, context(root, id)), "utf8"), before);
    assert.throws(() => provision(root, input));
    for (const r of Object.values(registry(root).records).filter(r => r.status === "incomplete")) {
      assert.equal(fs.existsSync(path.join(root, r.planPath)), false);
    }
  }
  assert.equal(fs.readFileSync(path.join(root, context(root, sibling)), "utf8"), siblingText);
  const records = Object.keys(registry(root).records);
  assert.equal(records.length, new Set(records).size);
});

test("current RG rejects all malformed sections before every execution caller without seal or ledger mutation", async t => {
  const root = currentFixture(t, 'import fs from "node:fs"; fs.writeFileSync("launched", "yes");');
  const id = provision(root, currentSpec());
  const plan = context(root, id);
  for (const modify of [
    i => { i.regression.covers = ""; },
    i => { i.regression.checks = "<specific assertion>"; },
    i => { i.regression.testLocation = "tests/"; },
    i => { i.regressionAssessment.coverage[0].layer = "unrelated frontend store boundary"; },
  ]) {
    const ledger = registry(root);
    const input = currentSpec();
    modify(input);
    const r = ledger.records[id];
    r.spec = input;
    const text = render(id, r.contract, input, r.planTemplate);
    r.planHash = sha(text);
    fs.writeFileSync(path.join(root, plan), text);
    json(root, "docs/validation/unified-task-registry.json", ledger);
    const bytes = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
    for (const [name, args] of [["check-failure-gate", [id]], ["validate-task-plans", []],
      ["check-regression-guard", []], ["run-validation", [id, "test-fast"]], ["validation-tier", ["test-fast", id]]]) {
      assert.notEqual(cli(root, name, args, { TASK_PLAN_FILE: plan, UNIFIED_TASK_ID: id }).status, 0, name);
    }
    await assert.rejects(run(root, id, "test-fast", plan));
    assert.equal(fs.existsSync(path.join(root, "launched")), false);
    assert.equal(fs.existsSync(path.join(root, ".local/failure-gate/runs")), false);
    assert.equal(fs.readFileSync(path.join(root, plan), "utf8"), text);
    assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), bytes);
  }
});

test("current deferrals use stable host refs and fresh commitment/scope/ownership at publication execution and delivery", async t => {
  const root = currentFixture(t, 'import fs from "node:fs"; fs.writeFileSync("launched", "yes");');
  const input = currentSpec();
  input.regression.deferral = { ref: "host:guard-coverage", owner: "fixture-maintainer",
    reason: "The faithful boundary harness requires separately committed work.",
    disposition: "Accepted follow-up owns this exact recurrence; affected release waits for its guard." };
  input.regression.testLocation = "Deferred to host:guard-coverage — work.mjs";
  const evidence = { verified: true, committed: true, eligible: true, projectId: policy(root).projectId,
    taskRef: "host:guard-coverage", owner: "fixture-maintainer", reference: "trusted-host:revision/1", revision: "1",
    commitment: "The committed follow-up will deliver the named gate-boundary assertion.",
    authorization: "Owner-approved deferral covers this recurrence and its dependency disposition.",
    recurrences: input.regressionAssessment.coverage.map(c => c.scenario) };
  let observed = evidence;
  const options = { resolveTask: () => observed };
  for (const change of [{ committed: false }, { eligible: false }, { verified: false }, { projectId: "other" },
    { owner: "other" }, { taskRef: "missing" }, { recurrences: [] }, { authorization: "" }, { revision: "" }, null]) {
    observed = change === null ? null : { ...evidence, ...change };
    assert.throws(() => provision(root, input, options), /deferral target/);
  }
  observed = evidence;
  const id = provision(root, input, options);
  const plan = context(root, id);
  checkPlan(root, id, "test-fast", plan, false, options);
  assert.throws(() => checkPlan(root, id, "test-fast", plan), /authentic host resolver/);
  for (const change of [{ eligible: false }, { recurrences: [] }, { owner: "other" }, { revision: "2" }, null]) {
    observed = change === null ? null : { ...evidence, ...change };
    await assert.rejects(run(root, id, "test-fast", plan, null, options));
    assert.throws(() => regressionPreflight(root, id, plan, registry(root).records[id].planHash, options));
    assert.equal(fs.existsSync(path.join(root, "launched")), false);
  }
  observed = evidence;
  // Delivery reuses read-only checkPlan with the real host resolver, not a receipt.
  assert.equal(checkPlan(root, id, "test-fast", plan, false, options).record.id, id);
  json(root, "receipt.json", { ...input, resolveTask: evidence });
  assert.match(cli(root, "new-plan", ["receipt.json"]).stderr, /authentic host resolver/);
});

test("Agent-first RG preflight reuses valid plans and detects native mismatch/stale revision; amendments require quiescence", t => {
  const root = currentFixture(t);
  const id = provision(root, currentSpec());
  const pathName = context(root, id);
  const r = registry(root).records[id];
  const text = fs.readFileSync(path.join(root, pathName), "utf8");
  const ledger = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
  assert.equal(cli(root, "check-regression-preflight", [id, r.planHash], { TASK_PLAN_FILE: pathName }).status, 0);
  assert.notEqual(cli(root, "check-regression-preflight", [id, "0".repeat(64)], { TASK_PLAN_FILE: pathName }).status, 0);
  assert.equal(regressionPreflight(root, id, pathName, r.planHash, { nativeSealedText: text }).planHash, r.planHash);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), ledger);
  assert.throws(() => regressionPreflight(root, id, pathName, r.planHash, { nativeSealedText: "changed native description" }), /Native\/local/);
  const release = lease(root, "target-fixture-repository");
  assert.throws(() => amend(root, id, "test-fast", "Prepare coverage before resuming affected work", currentSpec()), /Single-flight/);
  release();
  const active = registry(root);
  active.records[id].activeRun = { runId: "uncertain-fixture-run" };
  json(root, "docs/validation/unified-task-registry.json", active);
  assert.throws(() => amend(root, id, "test-fast", "Do not amend under an uncertain run", currentSpec()), /active or uncertain/);
  assert.throws(() => regressionPreflight(root, id, pathName, r.planHash), /active or uncertain/);
  delete active.records[id].activeRun;
  json(root, "docs/validation/unified-task-registry.json", active);
  fs.writeFileSync(path.join(root, "prior-observation.txt"), "Affected work paused; earlier observation is not new-revision validation.");
  const next = currentSpec({ what: "Repair existing admission and preserve earlier affected-work observations." });
  amend(root, id, "test-fast", "Add concrete coverage under already-covered maintenance scope", next);
  assert.throws(() => regressionPreflight(root, id, pathName, r.planHash), /Stale/);
  assert.ok(regressionPreflight(root, id, pathName, registry(root).records[id].planHash));
  assert.match(fs.readFileSync(path.join(root, "prior-observation.txt"), "utf8"), /paused/);
});

test("RG adoption preserves historical rule bytes; unknown mapping is local and amendments adopt current rules", t => {
  const root = currentFixture(t);
  const p = policy(root);
  p.newPlanTemplate = "unified-v3";
  json(root, "docs/validation/unified-policy.json", p);
  const historical = provision(root, spec());
  const old = registry(root).records[historical];
  const oldText = fs.readFileSync(path.join(root, old.planPath), "utf8");
  p.newPlanTemplate = "unified-v4";
  json(root, "docs/validation/unified-policy.json", p);
  checkPlan(root, historical, old.tier, old.planPath);
  assert.deepEqual(registry(root).records[historical], old);
  delete p.regressionGuard.contracts[old.contract + "/unified-v3"];
  json(root, "docs/validation/unified-policy.json", p);
  assert.throws(() => checkPlan(root, historical, old.tier, old.planPath), /unknown adoption mapping/);
  const current = provision(root, currentSpec());
  checkPlan(root, current, "test-fast", context(root, current));
  assert.equal(fs.readFileSync(path.join(root, old.planPath), "utf8"), oldText);
  p.regressionGuard.contracts[old.contract + "/unified-v3"] = "legacy-v1";
  json(root, "docs/validation/unified-policy.json", p);
  const tiers = fs.readFileSync(path.join(root, "docs/validation/unified-tiers.json"), "utf8");
  amend(root, historical, old.tier, "Adopt the current guard through an authorized supported amendment", currentSpec());
  assert.equal(registry(root).records[historical].planTemplate, "unified-v4");
  assert.equal(registry(root).records[historical].tierHash, old.tierHash);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-tiers.json"), "utf8"), tiers);
});

test("current workload inclusion is explicit; missing coverage blocks dispatch without tier mutation", async t => {
  const root = currentFixture(t, 'import fs from "node:fs"; fs.writeFileSync("launched", "yes");');
  const input = currentSpec();
  input.regression.testLocation = "future/unlisted.test.mjs";
  input.regressionAssessment.coverage[0].testLocation = "future/unlisted.test.mjs";
  const id = provision(root, input);
  const record = registry(root).records[id];
  const tierBytes = fs.readFileSync(path.join(root, "docs/validation/unified-tiers.json"), "utf8");
  await assert.rejects(run(root, id, "test-fast", record.planPath), /not in the bound workload/);
  assert.throws(() => regressionPreflight(root, id, record.planPath, record.planHash), /not in the bound workload/);
  assert.equal(fs.existsSync(path.join(root, "launched")), false);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-tiers.json"), "utf8"), tierBytes);
  amend(root, id, "test-fast", "Use the actual bound fixture guard without changing tiers", currentSpec());
  assert.equal((await run(root, id, "test-fast", record.planPath)).state, "PASS");
  assert.equal(fs.existsSync(path.join(root, "launched")), true);
  assert.equal(registry(root).records[id].activeRun, undefined);
  const guard = currentSpec();
  for (const argv of [
    ["node", "unrelated.mjs", "--test", "work.mjs"],
    ["node", "--import", "work.mjs", "unrelated.mjs"],
    ["pnpm", "run", "test", "work.mjs"],
  ]) assert.throws(() => assertRegressionWorkload(guard, { steps: [{ cwd: ".", argv }] }), /not in the bound workload/);
});

test("multiple risks need distinct mapped assertions and semantic review is not a delivered test", t => {
  const root = currentFixture(t);
  const input = currentSpec();
  const risk = { ...input.regressionAssessment.risks[0], id: "privacy", category: "security-privacy",
    change: "Private declaration data must remain isolated from unrelated task records." };
  const coverage = { ...input.regressionAssessment.coverage[0], risk: risk.id,
    scenario: "An unrelated task attempts to inspect private declaration data.",
    assertion: "Assert the unrelated task receives a denial and never receives private declaration text." };
  input.regressionAssessment.risks.push(risk);
  input.regressionAssessment.coverage.push(coverage);
  input.regression.covers += " " + coverage.scenario;
  input.regression.checks += " " + coverage.assertion;
  const id = provision(root, input);
  assert.equal(checkPlan(root, id, "test-fast", context(root, id)).record.id, id);
  input.regressionAssessment.coverage.pop();
  assert.throws(() => amend(root, id, "test-fast", "Uncovered second risk must not be admitted", input), /map each material risk/);
  // Equivalent negative control: the old shape validator ignores layer and risk
  // metadata, whereas current semantic-assessment consistency rejects it.
  const inadequate = currentSpec();
  inadequate.regressionAssessment.coverage[0].layer = "unrelated frontend store boundary";
  assert.throws(() => assessRegression(inadequate, render("fixture", policy(root).canonicalSha256, inadequate, "unified-v4")), /test layer/);
});

test("effective project policy and fake-ID refusal do not fabricate identities", () => {
  const p = readJson(SOURCE, "docs/validation/unified-policy.json");
  assert.ok(["staging", "active"].includes(p.mode));
  if (p.mode === "staging" && !p.bootstrap) {
    assert.equal(p.cutover, null);
    assert.equal(p.allocatorAuthorityVerified, false);
    assert.deepEqual(Object.keys(registry(SOURCE).records), []);
  }
  const check = cli(SOURCE, "check-failure-gate", []);
  assert.equal(check.status, 0);
  const denied = cli(SOURCE, "validation-tier", ["test-fast", "unknown"]);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /staged policy|authority|Unknown/);
});
test("private CLI provisions a unique plan with required sections", t => {
  const root = fixture(t);
  json(root, "spec.json", spec());
  const result = cli(root, "new-plan", ["spec.json"]);
  assert.equal(result.status, 0, result.stderr);
  const id = result.stdout.trim();
  assert.match(id, /^FGU-[a-f0-9-]{36}$/);
  const record = registry(root).records[id];
  assert.match(fs.readFileSync(path.join(root, record.planPath), "utf8"), /Flaky-test rule/);
  assert.match(record.planPath, /^\.local\/tasks\//);
  assert.equal(cli(root, "check-failure-gate", [id], { TASK_PLAN_FILE: record.planPath }).status, 0);
});

test("versioned authoring and amendments support normal, N/A, self and excluded declarations", t => {
  const root = fixture(t);
  const variants = [
    spec(),
    spec("test-fast", { title: "Fix a visual defect", what: "Fix the purely visual placement defect.",
      regression: { mode: "na", why: "This is a purely visual regression and the project has no screenshot or pixel-diff infrastructure to assert the affected pixels." } }),
    spec("test-fast", { title: "Add a checker", what: "Add a standalone guard script with disposable checker fixtures.",
      regression: { mode: "self", deliverable: "the primary deliverable is scripts/tests/failure-gate.test.mjs and the guard checker itself." } }),
    spec("test-fast", { title: "Add an independent panel", what: "Add a purely additive optional panel without changing existing behavior.",
      regression: { mode: "excluded", reason: "Only adds a new independent panel; prior behavior remains unchanged." } }),
  ];
  for (const input of variants) {
    json(root, "spec.json", input);
    const created = cli(root, "new-plan", ["spec.json"]);
    assert.equal(created.status, 0, created.stderr);
    const id = created.stdout.trim();
    const record = registry(root).records[id];
    assert.equal(record.planTemplate, "unified-v3");
    const text = fs.readFileSync(path.join(root, record.planPath), "utf8");
    for (const name of ["What & Why", "Done looks like", "Out of scope", "Steps", "Pre-existing failures to ignore", "Validation", "Relevant files"]) {
      assert.ok(text.includes("## " + name));
    }
    assert.equal(cli(root, "validate-task-plans", [], { TASK_PLAN_FILE: record.planPath, UNIFIED_TASK_ID: id }).status, 0);
    for (const replacement of variants) {
      json(root, "replacement.json", replacement);
      const changed = cli(root, "amend-plan", [id, "test-fast", "Same-tier declaration amendment with unchanged fixture coverage", "replacement.json"]);
      assert.equal(changed.status, 0, changed.stderr);
      checkPlan(root, id, "test-fast", context(root, id));
      assert.equal(registry(root).records[id].tier, "test-fast");
    }
  }
});

test("invalid new declarations cannot publish; failed amendments preserve every sealed byte and identity", t => {
  const root = fixture(t);
  const sibling = provision(root, spec());
  const siblingText = fs.readFileSync(path.join(root, context(root, sibling)), "utf8");
  const bad = [
    { mode: "na", why: "It is hard to test authorization in this project." },
    { mode: "self", deliverable: "the deliverable is scripts/tests/auth.test.mjs alongside an authorization fix." },
    { mode: "excluded", reason: "This is not purely additive." },
    { mode: "normal", covers: "Authorization", testLocation: "unnamed coverage", checks: "It works" },
  ];
  for (const regression of bad) {
    const input = spec("test-fast", { title: "Fix authorization", what: "Fix authorization so another tenant cannot read protected records.", regression });
    json(root, "bad.json", input);
    const failed = cli(root, "new-plan", ["bad.json"]);
    assert.notEqual(failed.status, 0);
    const before = fs.readFileSync(path.join(root, context(root, sibling)), "utf8");
    const ledger = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
    const amendment = cli(root, "amend-plan", [sibling, "test-fast", "Attempt an invalid declaration", "bad.json"]);
    assert.notEqual(amendment.status, 0);
    assert.equal(fs.readFileSync(path.join(root, context(root, sibling)), "utf8"), before);
    assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), ledger);
  }
  const records = Object.values(registry(root).records);
  assert.equal(records.filter(record => record.status === "incomplete").length, bad.length);
  for (const record of records.filter(record => record.status === "incomplete")) {
    assert.equal(fs.existsSync(path.join(root, record.planPath)), false);
  }
  assert.equal(fs.readFileSync(path.join(root, context(root, sibling)), "utf8"), siblingText);
  const deferred = spec("test-fast", { regression: { ...spec().regression,
    testLocation: "Deferred to task #999 (accepted) — requires a new fixture harness for tenant access." } });
  assert.throws(() => provision(root, deferred), /authoritative accepted host-task evidence/);
});

test("current strict check blocks sealed invalid declarations at all execution routes without launch or repair", async t => {
  const root = fixture(t, 'import fs from "node:fs"; fs.writeFileSync("launched", "yes");');
  const id = provision(root, spec());
  const plan = context(root, id);
  // Simulate an earlier linter admitting a syntactically sealed but invalid plan.
  // This is a disposable, uncommitted registry, never a live record mutation.
  const ledger = registry(root);
  const record = ledger.records[id];
  record.spec = spec("test-fast", { title: "Fix authorization", what: "Fix authorization for protected tenant records.",
    regression: { mode: "excluded", reason: "This is not purely additive." } });
  const invalid = render(id, record.contract, record.spec, record.planTemplate);
  fs.writeFileSync(path.join(root, plan), invalid);
  record.planHash = sha(invalid);
  json(root, "docs/validation/unified-task-registry.json", ledger);
  fs.writeFileSync(path.join(root, ".local/tasks/archive.md"), "# Fix historical crash\n");
  const before = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
  const env = { TASK_PLAN_FILE: plan, UNIFIED_TASK_ID: id };
  for (const [name, args] of [
    ["check-failure-gate", [id]], ["validate-task-plans", []],
    ["run-validation", [id, "test-fast"]], ["validation-tier", ["test-fast", id]],
  ]) {
    const result = cli(root, name, args, env);
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, /Regression Guard strict check failed/);
  }
  await assert.rejects(run(root, id, "test-fast", plan), /Regression Guard strict check failed/);
  assert.equal(fs.existsSync(path.join(root, "launched")), false);
  assert.equal(fs.existsSync(path.join(root, ".local/failure-gate/runs")), false);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(root, plan), "utf8"), invalid);
  assert.equal(fs.readFileSync(path.join(root, ".local/tasks/archive.md"), "utf8"), "# Fix historical crash\n");
  // A supported amendment is the recovery route, not in-place stub repair.
  amend(root, id, "test-fast", "Supply the missing tenant-access regression assertion", spec());
  assert.equal(checkPlan(root, id, "test-fast", plan).record.id, id);
});

test("both plan guards reject empty, directory, missing and non-md targets without touching siblings", t => {
  const root = fixture(t);
  const id = provision(root, spec());
  const plan = context(root, id);
  const sealed = fs.readFileSync(path.join(root, plan), "utf8");
  fs.mkdirSync(path.join(root, "directory.md"));
  for (const target of ["", "missing.md", "not-markdown.txt", "directory.md"]) {
    for (const [name, args] of [["check-regression-guard", []], ["check-failure-gate", [id]], ["validate-task-plans", []]]) {
      const result = cli(root, name, args, { TASK_PLAN_FILE: target, UNIFIED_TASK_ID: id });
      assert.notEqual(result.status, 0, `${name}: ${target}`);
      assert.match(result.stderr, /TASK_PLAN_FILE/);
    }
    assert.equal(fs.readFileSync(path.join(root, plan), "utf8"), sealed);
    const noId = cli(root, "check-failure-gate", [], { TASK_PLAN_FILE: target });
    assert.notEqual(noId.status, 0);
    assert.match(noId.stderr, /TASK_PLAN_FILE/);
  }
  assert.match(cli(root, "check-failure-gate", [], { TASK_PLAN_FILE: plan }).stderr, /requires the bound task ID/);
});

test("new representation does not reinterpret historical renderer or contract mappings", t => {
  const root = fixture(t);
  const p = policy(root);
  delete p.newPlanTemplate;
  json(root, "docs/validation/unified-policy.json", p);
  const id = provision(root, spec());
  const sealed = fs.readFileSync(path.join(root, context(root, id)), "utf8");
  const old = registry(root).records[id];
  p.newPlanTemplate = "unified-v3";
  json(root, "docs/validation/unified-policy.json", p);
  checkPlan(root, id, "test-fast", context(root, id));
  assert.equal(fs.readFileSync(path.join(root, context(root, id)), "utf8"), sealed);
  assert.deepEqual(registry(root).records[id], old);
  const next = provision(root, spec());
  assert.equal(registry(root).records[next].planTemplate, "unified-v3");
  assert.equal(p.planTemplates[p.canonicalSha256], "unified-v2");
  amend(root, id, "test-fast", "Adopt complete plan sections without changing the bound workload", spec());
  assert.equal(registry(root).records[id].planTemplate, "unified-v3");
  assert.equal(registry(root).records[id].contract, old.contract);
});

test("deferrals require authoritative project/ref/non-draft evidence at each plan write", t => {
  const root = fixture(t);
  const input = spec("test-fast", { regression: { ...spec().regression,
    testLocation: "Deferred to task #999 (accepted) — a separate fixture harness is required for tenant access." } });
  const evidence = { verified: true, projectId: policy(root).projectId, taskRef: "999",
    state: "IN_PROGRESS", reference: "host-task-service:fixture/999/revision-1" };
  for (const change of [{ verified: false }, { projectId: "elsewhere" }, { taskRef: "123" }, { state: "PROPOSED" },
    { state: "CANCELLED" }, { reference: "" }]) {
    assert.throws(() => provision(root, input, { resolveTask: () => ({ ...evidence, ...change }) }), /authoritatively accepted/);
  }
  assert.deepEqual(Object.keys(registry(root).records), []);
  const id = provision(root, input, { resolveTask: () => evidence });
  checkPlan(root, id, "test-fast", context(root, id));
  assert.equal(registry(root).records[id].regressionDeferral.reference, evidence.reference);
  const before = registry(root);
  assert.throws(() => amend(root, id, "test-fast", "Renew the deferred guard", input), /authoritative accepted host-task evidence/);
  assert.deepEqual(registry(root), before);
  amend(root, id, "test-fast", "Renew the accepted deferral from authoritative host data", input, { resolveTask: () => evidence });
  checkPlan(root, id, "test-fast", context(root, id));
  amend(root, id, "test-fast", "Deliver the regression guard in this plan instead", spec());
  assert.equal(registry(root).records[id].regressionDeferral, undefined);
  // The real CLI has no host adapter. JSON claiming acceptance must not enable it.
  json(root, "deferred.json", { ...input, resolveTask: evidence, regressionDeferral: evidence });
  assert.match(cli(root, "new-plan", ["deferred.json"]).stderr, /authoritative accepted host-task evidence/);
});
test("package forwarded argument separator preserves exactly one task context", t => {
  const root = fixture(t);
  const id = provision(root, spec());
  const result = cli(root, "validation-tier", ["test-fast", "--", id], { TASK_PLAN_FILE: context(root, id) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).id, id);
  assert.notEqual(cli(root, "validation-tier", ["test-fast", "--", id, id], { TASK_PLAN_FILE: context(root, id) }).status, 0);
});
test("all four bindings deny every wrong tier before launch and permit the recorded tier", async t => {
  const root = fixture(t, 'import fs from "node:fs"; fs.writeFileSync("launched", "yes")');
  for (const chosen of TIERS) {
    const id = provision(root, spec(chosen));
    for (const wrong of TIERS.filter(tier => tier !== chosen)) {
      await assert.rejects(run(root, id, wrong, context(root, id)), /Wrong contract\/tier/);
      assert.equal(fs.existsSync(path.join(root, "launched")), false);
    }
    const result = await run(root, id, chosen, context(root, id));
    assert.equal(result.state, "PASS");
    fs.unlinkSync(path.join(root, "launched"));
  }
});
test("missing context, unknown IDs, edited plans and source drift fail closed", async t => {
  const root = fixture(t);
  const id = provision(root, spec());
  await assert.rejects(run(root, id, "test-fast", undefined), /TASK_PLAN_FILE/);
  await assert.rejects(run(root, "FGU-unknown", "test-fast", "bad.md"), /Unknown/);
  fs.appendFileSync(path.join(root, context(root, id)), "\nextra scope\n");
  await assert.rejects(run(root, id, "test-fast", context(root, id)), /Plan changed/);
  fs.appendFileSync(path.join(root, ".agents/skills/failure-gate-unified/SKILL.md"), "\ndrift");
  assert.throws(() => provision(root, spec()), /Canonical source drift/);
});
test("generation failure reserves identity permanently; cancelled/deleted plans do not reuse it", t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, ".local"), { recursive: true });
  fs.writeFileSync(path.join(root, ".local/tasks"), "private fixture obstruction");
  assert.throws(() => provision(root, spec()));
  const reserved = Object.keys(registry(root).records)[0];
  assert.equal(registry(root).records[reserved].status, "incomplete");
  fs.unlinkSync(path.join(root, ".local/tasks"));
  const id = provision(root, spec());
  cancel(root, id, "Fixture cancellation preserves identity");
  fs.unlinkSync(path.join(root, context(root, id)));
  const next = provision(root, spec());
  assert.notEqual(next, id);
  assert.notEqual(next, reserved);
  assert.equal(registry(root).records[id].status, "cancelled");
});
test("concurrent CLI allocations serialize or reject without lost records", async t => {
  const root = fixture(t);
  json(root, "spec.json", spec());
  const results = await Promise.all(Array.from({ length: 6 }, () => new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, "scripts/new-plan.mjs"), "spec.json"], {
      cwd: root, env: { PATH: process.env.PATH, REPL_ID: process.env.REPL_ID }, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", s => { stdout += s; });
    child.stderr.on("data", s => { stderr += s; });
    child.on("close", code => resolve({ code, stdout, stderr }));
  })));
  const successful = results.filter(r => r.code === 0).map(r => r.stdout.trim());
  assert.ok(successful.length);
  assert.equal(new Set(successful).size, successful.length);
  const records = registry(root).records;
  for (const id of successful) assert.equal(records[id].status, "provisioned");
  for (const r of results.filter(r => r.code !== 0)) assert.match(r.stderr, /lock retained/);
});
test("explicit amendments update plan and binding together; drift requires renewal", async t => {
  const root = fixture(t);
  const id = provision(root, spec());
  const table = readJson(root, "docs/validation/unified-tiers.json");
  table.tiers["test-fast"].timeoutMs += 1;
  json(root, "docs/validation/unified-tiers.json", table);
  await assert.rejects(run(root, id, "test-fast", context(root, id)), /definition changed/);
  amend(root, id, "test-standard", "Documented fixture coverage amendment");
  checkPlan(root, id, "test-standard", context(root, id));
  await assert.rejects(run(root, id, "test-fast", context(root, id)), /Wrong contract/);
  assert.equal(registry(root).records[id].events.at(-1).kind, "amended");
});
test("legacy native linkage cannot be retroactively bound", t => {
  const root = fixture(t);
  assert.throws(() => provision(root, spec("test-fast", { nativeTaskRef: "#2" })), /retroactively/);
});
test("actual CLI route admits a different checkout path with sealed plans and tier enforcement", async t => {
  const root = fixture(t);
  json(root, "spec.json", spec());
  const minted = cli(root, "new-plan", ["spec.json"]);
  assert.equal(minted.status, 0, minted.stderr);
  const id = minted.stdout.trim();
  const plan = context(root, id);
  assert.equal(cli(root, "check-failure-gate", [id], { TASK_PLAN_FILE: plan, UNIFIED_TASK_ID: id }).status, 0);
  assert.equal(cli(root, "validate-task-plans", [], { TASK_PLAN_FILE: plan, UNIFIED_TASK_ID: id }).status, 0);
  assert.notEqual(cli(root, "validate-task-plans", [], { TASK_PLAN_FILE: plan }).status, 0);
  const copied = fs.mkdtempSync(path.join(os.tmpdir(), "cloudpainter-copied-gate-"));
  t.after(() => fs.rmSync(copied, { recursive: true, force: true }));
  fs.cpSync(root, copied, { recursive: true });
  const admitted = cli(copied, "check-failure-gate", [id], { TASK_PLAN_FILE: plan });
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.equal(cli(copied, "validate-task-plans", [], { TASK_PLAN_FILE: plan, UNIFIED_TASK_ID: id }).status, 0);
  assert.equal((await run(copied, id, "test-fast", plan)).state, "PASS");
  assert.throws(() => checkPlan(copied, id, "test-heavy", plan), /Wrong contract\/tier/);
  json(copied, "spec.json", spec());
  const generated = cli(copied, "new-plan", ["spec.json"]);
  assert.equal(generated.status, 0, generated.stderr);
  assert.notEqual(generated.stdout.trim(), id);
  assert.equal(cli(root, "check-failure-gate", [id], { TASK_PLAN_FILE: plan }).status, 0);
});
test("admission, provisioning and runner remain usable across simulated boot/device changes", async t => {
  const root = fixture(t);
  const read = fs.readFileSync, stat = fs.statSync;
  let device = 1, boot = "fixture-first-boot", identityReads = 0;
  // Instrument only the disposable root; no live host identity is changed.
  fs.statSync = function(file, ...args) {
    const result = stat.call(this, file, ...args);
    if (file === root) { identityReads++; return { ...result, dev: device, ino: 256 }; }
    return result;
  };
  fs.readFileSync = function(file, ...args) {
    if (String(file) === "/proc/sys/kernel/random/boot_id") { identityReads++; return boot; }
    return read.call(this, file, ...args);
  };
  try {
    const id = provision(root, spec());
    checkPlan(root, id, "test-fast", context(root, id));
    device = 77; boot = "fixture-next-boot";
    assert.equal(policy(root, true).mode, "active");
    assert.equal((await run(root, id, "test-fast", context(root, id))).state, "PASS");
    const next = provision(root, spec());
    assert.notEqual(next, id);
    assert.equal(identityReads, 0, "gate must not depend on machine identity");
  } finally { fs.readFileSync = read; fs.statSync = stat; }
});
test("older sealed contract verifies unchanged after pin update; amendment explicitly adopts current contract", async t => {
  const root = fixture(t);
  const p = policy(root);
  const oldContract = p.canonicalSha256;
  p.planTemplates[oldContract] = "legacy-v1";
  delete p.newPlanTemplate;
  json(root, "docs/validation/unified-policy.json", p);
  const oldSpec = spec(); delete oldSpec.coverageEvidence;
  const id = provision(root, oldSpec);
  const plan = context(root, id);
  const sealed = fs.readFileSync(path.join(root, plan), "utf8");
  assert.match(sealed, /Do not escalate/);
  fs.appendFileSync(path.join(root, p.canonicalSource), "\nFixture next revision\n");
  p.canonicalSha256 = sha(fs.readFileSync(path.join(root, p.canonicalSource)));
  p.planTemplates[p.canonicalSha256] = "unified-v2";
  p.regressionGuard.contracts[p.canonicalSha256 + "/unified-v2"] = "legacy-v1";
  json(root, "docs/validation/unified-policy.json", p);
  checkPlan(root, id, "test-fast", plan);
  assert.equal((await run(root, id, "test-fast", plan)).state, "PASS");
  assert.equal(registry(root).records[id].contract, oldContract);
  assert.equal(fs.readFileSync(path.join(root, plan), "utf8"), sealed);
  const current = provision(root, spec());
  assert.equal(registry(root).records[current].contract, p.canonicalSha256);
  assert.throws(() => amend(root, id, "test-fast", "Adopt current contract"), /coverageEvidence/);
  amend(root, id, "test-fast", "Adopt current contract", spec());
  assert.equal(registry(root).records[id].contract, p.canonicalSha256);
  checkPlan(root, id, "test-fast", plan);
  const broken = policy(root); delete broken.planTemplates[p.canonicalSha256];
  json(root, "docs/validation/unified-policy.json", broken);
  assert.throws(() => checkPlan(root, id, "test-fast", plan), /Unknown sealed contract/);
});
test("new plans render the canonical Validation section exactly and require coverage evidence", t => {
  const root = fixture(t);
  const input = spec();
  const canonical = fs.readFileSync(path.join(root, policy(root).canonicalSource), "utf8");
  const required = canonical.match(/Every plan must include this section[\s\S]*?```markdown\n([\s\S]*?)```/)[1]
    .replace("`test-standard`", "`test-fast`")
    .replace("<one-line reason this tier covers the task>", input.why)
    .replace("<current tier definition/workload reference and supported invocation>", input.coverageEvidence);
  const id = provision(root, input);
  const plan = fs.readFileSync(path.join(root, context(root, id)), "utf8");
  assert.ok(plan.includes(required));
  for (const section of ["What & Why", "Pre-existing failures to ignore", "Validation", "Regression Guard"]) {
    assert.ok(plan.includes("## " + section));
  }
  const before = Object.keys(registry(root).records);
  assert.throws(() => provision(root, { ...input, coverageEvidence: undefined }), /coverageEvidence/);
  assert.deepEqual(Object.keys(registry(root).records), before);
  assert.throws(() => render(id, policy(root).canonicalSha256, input, "unknown"), /Unknown/);
});
test("committed merge guard rejects lost IDs, tombstones and unsupported binding edits", async t => {
  const root = fixture(t);
  const git = args => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
  };
  const id = provision(root, spec());
  const tombstone = provision(root, spec());
  cancel(root, tombstone, "Retain fixture cancellation");
  const committed = registry(root);
  git(["init", "--quiet"]);
  git(["add", "docs/validation/unified-task-registry.json"]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "Fixture registry baseline"]);
  const restore = () => json(root, "docs/validation/unified-task-registry.json", committed);
  for (const missing of [id, tombstone]) {
    const dropped = structuredClone(committed); delete dropped.records[missing];
    json(root, "docs/validation/unified-task-registry.json", dropped);
    const denied = cli(root, "check-failure-gate", []);
    assert.notEqual(denied.status, 0); assert.match(denied.stderr, /dropped ID or tombstone/);
    restore();
  }
  for (const key of ["tier", "planHash", "contract"]) {
    const changed = structuredClone(committed); changed.records[id][key] = key === "tier" ? "test-heavy" : "0".repeat(64);
    json(root, "docs/validation/unified-task-registry.json", changed);
    assert.throws(() => registry(root), /unsupported record change/);
    restore();
  }
  const resurrected = structuredClone(committed); resurrected.records[tombstone].status = "provisioned";
  assert.throws(() => assertRegistryEvolution(committed, resurrected), /terminal identity reopened/);
  const withTombstones = { ...committed, tombstones: { retained: { tier: "test-fast" } } };
  assert.throws(() => assertRegistryEvolution(withTombstones, committed), /dropped or changed tombstone/);
  const deletedHistory = structuredClone(committed); deletedHistory.records[id].events.shift();
  assert.throws(() => assertRegistryEvolution(committed, deletedHistory), /rewritten event\/run history/);
  assert.equal(cli(root, "check-failure-gate", []).status, 0);
  amend(root, id, "test-standard", "Supported fixture amendment");
  assert.equal((await run(root, id, "test-standard", context(root, id))).state, "PASS");
  cancel(root, id, "Supported fixture cancellation");
  assert.equal(registry(root).records[id].status, "cancelled");
});
test("symlinks including dangling links and traversal are denied", t => {
  const root = fixture(t);
  fs.symlinkSync("/tmp/no-such-outside-gate-target", path.join(root, "escape"));
  assert.throws(() => safePath(root, "escape"), /Symlink/);
  assert.throws(() => safePath(root, "../escape"), /escapes/);
});
test("same-target single flight rejects duplicates and amendments during a run", async t => {
  const root = fixture(t, 'import fs from "node:fs"; fs.writeFileSync("started", "yes"); setTimeout(() => {}, 700);');
  const id = provision(root, spec());
  const other = provision(root, spec());
  const first = run(root, id, "test-fast", context(root, id));
  await waitFor(() => fs.existsSync(path.join(root, "started")));
  await assert.rejects(run(root, other, "test-fast", context(root, other)), /lock retained/);
  assert.throws(() => amend(root, id, "test-standard", "Cannot amend active fixture"), /lock retained|active or uncertain/);
  assert.equal((await first).state, "PASS");
});
test("timeout cleans TERM-ignoring owned work and preserves an unrelated sentinel", async t => {
  const root = fixture(t, 'import fs from "node:fs"; fs.writeFileSync("pid", String(process.pid)); process.on("SIGTERM", () => {}); setInterval(() => {}, 100);');
  const table = readJson(root, "docs/validation/unified-tiers.json");
  table.tiers["test-fast"].stepTimeoutMs = 250;
  json(root, "docs/validation/unified-tiers.json", table);
  const sentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 100)"], { stdio: "ignore", env: { PATH: process.env.PATH } });
  t.after(() => sentinel.kill("SIGKILL"));
  const id = provision(root, spec());
  const report = await run(root, id, "test-fast", context(root, id));
  assert.equal(report.state, "INCOMPLETE");
  assert.equal(report.steps[0].blocked, "timeout");
  assert.equal(report.steps[0].quiescent, true);
  assert.equal(alive(Number(fs.readFileSync(path.join(root, "pid"), "utf8"))), false);
  assert.equal(alive(sentinel.pid), true);
});
test("detached descendants are adopted, stopped and reaped before PASS", async t => {
  const root = fixture(t, `import {spawn} from "node:child_process"; import fs from "node:fs"; const c=spawn(process.execPath, ["-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},100)'], {detached:true,stdio:"ignore"}); fs.writeFileSync("descendant",String(c.pid)); c.unref();`);
  const id = provision(root, spec());
  const report = await run(root, id, "test-fast", context(root, id));
  assert.equal(report.state, "PASS");
  assert.equal(alive(Number(fs.readFileSync(path.join(root, "descendant"), "utf8"))), false);
});
test("supervisor failure retains exclusion; no stale-lock automatic recovery", async t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "scripts/failure-gate/supervisor.py"), 'raise RuntimeError("fixture supervisor unavailable")\n');
  const id = provision(root, spec());
  const report = await run(root, id, "test-fast", context(root, id));
  assert.equal(report.state, "INCOMPLETE");
  assert.equal(report.steps[0].quiescent, false);
  await assert.rejects(run(root, id, "test-fast", context(root, id)), /lock retained/);
});
test("killed CLI parent triggers child cleanup and leaves its lease retained", async t => {
  const root = fixture(t, 'import fs from "node:fs"; fs.writeFileSync("pid",String(process.pid)); process.on("SIGTERM",()=>{});setInterval(()=>{},100);');
  const id = provision(root, spec());
  const child = spawn(process.execPath, [path.join(root, "scripts/run-validation.mjs"), id, "test-fast"], {
    cwd: root, env: { PATH: process.env.PATH, REPL_ID: process.env.REPL_ID, TASK_PLAN_FILE: context(root, id) }, stdio: "ignore"
  });
  await waitFor(() => fs.existsSync(path.join(root, "pid")));
  const pid = Number(fs.readFileSync(path.join(root, "pid"), "utf8"));
  child.kill("SIGKILL");
  await waitFor(() => !alive(pid));
  assert.ok(fs.existsSync(path.join(root, ".local/failure-gate/locks/target-fixture-repository")));
  assert.equal(registry(root).records[id].assessment, undefined);
  assert.ok(registry(root).records[id].activeRun);
  assert.throws(() => amend(root, id, "test-heavy", "No false recovery of an interrupted run"), /active or uncertain/);
});
test("credentials and NODE_OPTIONS are not forwarded to validation children", async t => {
  const root = fixture(t, 'import fs from "node:fs"; fs.writeFileSync("environment", JSON.stringify({poe: "POE_API_KEY" in process.env, database: "DATABASE_URL" in process.env, options:"NODE_OPTIONS" in process.env}));');
  const id = provision(root, spec());
  const report = await run(root, id, "test-fast", context(root, id));
  assert.equal(report.state, "PASS");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "environment"), "utf8")), { poe: false, database: false, options: false });
});
test("missing disposable-resource capability blocks before a command starts", async t => {
  const root = fixture(t);
  const table = readJson(root, "docs/validation/unified-tiers.json");
  table.tiers["test-heavy"].requires = ["verified-private-resource"];
  json(root, "docs/validation/unified-tiers.json", table);
  const id = provision(root, spec("test-heavy"));
  const report = await run(root, id, "test-heavy", context(root, id));
  assert.equal(report.state, "BLOCKED");
  assert.equal(report.steps.length, 0);
});
test("exact ignored baseline can assess PASS while retaining raw failure; owned repair fails", async t => {
  const root = fixture(t, failureWork, "node-tap");
  const first = provision(root, spec());
  const failed = await run(root, first, "test-fast", context(root, first));
  assert.equal(failed.state, "FAIL");
  const observation = failed.steps[0].assessment.classifications[0];
  assert.ok(observation, JSON.stringify(failed));
  json(root, "docs/validation/failure-baseline.json", { schemaVersion: 1, entries: [{
    id: "existing_failure", status: "active", disposition: "ignored",
    suite: observation.suite, test: observation.test, signature: observation.signature
  }] });
  const ignored = provision(root, spec("test-fast", { baselines: [{ id: "existing_failure", kind: "ignored" }] }));
  const pass = await run(root, ignored, "test-fast", context(root, ignored));
  assert.equal(pass.state, "PASS");
  assert.equal(pass.rawAllPassed, false);
  assert.notEqual(pass.steps[0].exit, 0);
  const owned = provision(root, spec("test-fast", { baselines: [{ id: "existing_failure", kind: "owned" }] }));
  assert.equal((await run(root, owned, "test-fast", context(root, owned))).state, "FAIL");
  const stale = baseline(root);
  stale.entries[0].expiresAt = "2000-01-01T00:00:00.000Z";
  json(root, "docs/validation/failure-baseline.json", stale);
  assert.equal(warnings(baseline(root)).length, 1);
  assert.equal((await run(root, ignored, "test-fast", context(root, ignored))).state, "FAIL");
});
test("passing isolated retry is not provenance; documented evidence is logged separately", async t => {
  const root = fixture(t, failureWork, "node-tap");
  const id = provision(root, spec());
  const initial = await run(root, id, "test-fast", context(root, id));
  fs.writeFileSync(path.join(root, "work.mjs"), 'import test from "node:test"; test("known failure",()=>{});');
  const retry = await run(root, id, "test-fast", context(root, id), { runId: initial.runId, stepIndex: 0, failureIndex: 0 });
  assert.equal(retry.state, "PASS");
  assert.equal(retry.isolatedRetryOnly, true);
  assert.equal(registry(root).records[id].assessment.state, "FAIL");
  assert.throws(() => selfClassify(root, id, initial.runId, 0, 0, []), /contextual evidence/);
  const quote = "This exact fixture error was documented before the task's changes.";
  fs.writeFileSync(path.join(root, "docs/validation/pattern.md"), quote);
  assert.match(selfClassify(root, id, initial.runId, 0, 0, [{ type: "documented-pattern", file: "docs/validation/pattern.md", quote }]), /SELF-CLASSIFIED/);
  fs.writeFileSync(path.join(root, "work.mjs"), failureWork);
  const next = await run(root, id, "test-fast", context(root, id));
  assert.equal(next.state, "PASS");
  assert.equal(next.rawAllPassed, false);
  assert.equal(next.steps[0].assessment.classifications[0].note.inference, true);
});
test("unknown output, ambiguous catalog and skipped required tests never count as PASS", async t => {
  assert.equal(parseFailures({ adapter: "node-tap", name: "work" }, "unknown format"), null);
  const f = { suite: "suite", test: "test", signature: "error" };
  assert.equal(evaluateFailures({ entries: [] }, {}, [f]).acceptable, false);
  assert.equal(evaluateFailures({ entries: [
    { ...f, id: "a", status: "active", disposition: "ignored" },
    { ...f, id: "b", status: "active", disposition: "ignored" }
  ] }, { baselines: [{ id: "a", kind: "ignored" }] }, [f]).acceptable, false);
  const root = fixture(t, 'import test from "node:test"; test.skip("required check",()=>{});', "node-tap");
  const id = provision(root, spec());
  assert.equal((await run(root, id, "test-fast", context(root, id))).state, "INCOMPLETE");
});
test("superseded alias cannot import the former rules; canonical target remains unchanged", () => {
  const command = fs.readFileSync(path.join(SOURCE, ".agents/skills/skill-application-router/references/custom-skill-commands.md"), "utf8");
  assert.match(command, /historical alias, not a policy definition/);
  assert.doesNotMatch(command, /three isolated retries|at least two factors/);
  assert.equal(sha(fs.readFileSync(path.join(SOURCE, ".agents/skills/failure-gate-unified/SKILL.md"))),
    readJson(SOURCE, "docs/validation/unified-policy.json").canonicalSha256);
});
test("administrative closure cannot forge authority or overwrite failed assessment", async t => {
  const root = fixture(t, 'process.exit(1)');
  const id = provision(root, spec());
  await run(root, id, "test-fast", context(root, id));
  assert.throws(() => closeOwnerDirection(root, id), /adapter unavailable/);
  assert.throws(() => closeOwnerDirection(root, id, () => ({ verified: false })), /Unverified/);
  closeOwnerDirection(root, id, taskId => ({ verified: true, taskId, reference: "private-fixture-owner-record", quote: "Close the fixture administratively" }));
  const record = registry(root).records[id];
  assert.equal(record.completionMode, "owner_direction");
  assert.equal(record.assessment.state, "FAIL");
  assert.match(record.administrativeClosure.disclaimer, /not a successful test run/);
});
test("read-only recovery preview protects tombstones and never overwrites current state", t => {
  const root = fixture(t);
  const before = registry(root);
  const id = provision(root, spec());
  cancel(root, id, "Keep fixture tombstone forever");
  json(root, "backup.json", before);
  const bytes = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
  const preview = recoveryPreview(root, "backup.json");
  assert.deepEqual(preview.omittedIds, [id]);
  assert.equal(preview.canOverwrite, false);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), bytes);
});
test("uncertain registry persistence retains its transaction lock", t => {
  const root = fixture(t);
  assert.throws(() => transaction(root, () => {
    const file = path.join(root, "docs/validation/unified-task-registry.json");
    fs.renameSync(file, file + ".fixture-backup");
    fs.mkdirSync(file);
  }));
  assert.ok(fs.existsSync(path.join(root, ".local/failure-gate/locks/registry")));
});
test("sealed Unified guard is strict, scoped and never rewrites historical archive plans", t => {
  const root = fixture(t);
  const id = provision(root, spec());
  const selected = context(root, id);
  const sealed = fs.readFileSync(path.join(root, selected), "utf8");
  fs.writeFileSync(path.join(root, ".local/tasks/historical.md"), "# Fix old crash\n\n## What & Why\nLegacy record without a guard.\n");
  const historical = fs.readFileSync(path.join(root, ".local/tasks/historical.md"), "utf8");
  const result = cli(root, "validate-task-plans", [], { UNIFIED_TASK_ID: id, TASK_PLAN_FILE: selected });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(root, selected), "utf8"), sealed);
  assert.equal(fs.readFileSync(path.join(root, ".local/tasks/historical.md"), "utf8"), historical);
  fs.writeFileSync(path.join(root, selected), sealed.replace(/## Regression Guard[\s\S]*/, ""));
  const denied = cli(root, "validate-task-plans", [], { UNIFIED_TASK_ID: id, TASK_PLAN_FILE: selected });
  assert.notEqual(denied.status, 0);
  assert.doesNotMatch(fs.readFileSync(path.join(root, selected), "utf8"), /## Regression Guard/);
});
test("independent targets can run without a blanket global validation lock", async t => {
  const root = fixture(t, "setTimeout(()=>{}, 250);");
  const table = readJson(root, "docs/validation/unified-tiers.json");
  table.tiers["test-standard"].target = "independent-fixture";
  json(root, "docs/validation/unified-tiers.json", table);
  const one = provision(root, spec());
  const two = provision(root, spec("test-standard"));
  const reports = await Promise.all([
    run(root, one, "test-fast", context(root, one)),
    run(root, two, "test-standard", context(root, two))
  ]);
  assert.deepEqual(reports.map(r => r.state), ["PASS", "PASS"], JSON.stringify(reports));
});

function governed(t, work = 'console.log("ok")') {
  const root = currentFixture(t, work);
  const p = policy(root);
  p.preflightContracts = [p.canonicalSha256];
  json(root, "docs/validation/unified-policy.json", p);
  return root;
}
const governedSpec = (extra = {}) => currentSpec({ nativeTaskRef: "#400", ...extra });
const coordination = {
  authorizationApplicability: "Fixture-only scope inspection; this is not actual owner approval or a host receipt.",
  evidenceImpact: "Pause affected work; preserve earlier changes and rerun affected checks after native reconciliation.",
};
function observed(root, id) {
  const r = registry(root).records[id];
  return { id, planHash: r.planHash, tier: r.tier, contract: r.contract,
    nativeTaskRef: r.spec.nativeTaskRef, nativeSealedText: fs.readFileSync(path.join(root, r.planPath), "utf8") };
}

test("Unified preflight is read-only, exact-context scoped and never announces host approval", async t => {
  const root = governed(t);
  const id = provision(root, governedSpec());
  const ctx = observed(root, id);
  const before = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
  const plan = ctx.nativeSealedText;
  assert.deepEqual(sealedInputs(root, id), ctx);
  const result = preflight(root, id, context(root, id), ctx);
  assert.equal(result.hostAuthorization, "NOT_OBSERVED");
  assert.equal(result.hostLifecycle, "NOT_OBSERVED");
  assert.equal(result.assessment, "LOCAL_PLAN_VALID_HOST_CHECKS_REQUIRED");
  for (const bad of [undefined, {}, { ...ctx, approved: true }, { ...ctx, planHash: "0".repeat(64) },
    { ...ctx, id: "FGU-" + cryptoFixtureId() }, { ...ctx, tier: "test-heavy" },
    { ...ctx, contract: "0".repeat(64) }, { ...ctx, nativeTaskRef: "#401" },
    { ...ctx, nativeSealedText: plan + "\nStart approved" }]) {
    await assert.rejects(dispatch(root, id, context(root, id), bad, () => fs.writeFileSync(path.join(root, "sentinel"), "unsafe")));
    assert.equal(fs.existsSync(path.join(root, "sentinel")), false);
  }
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(root, context(root, id)), "utf8"), plan);
  json(root, "native-context.json", ctx);
  const cliResult = cli(root, "check-unified-preflight", [id], { TASK_PLAN_FILE: context(root, id), UNIFIED_CONTEXT_FILE: "native-context.json" });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).hostAuthorization, "NOT_OBSERVED");
  assert.equal(cli(root, "check-unified-preflight", [id], { TASK_PLAN_FILE: context(root, id) }).status, 1);
  fs.writeFileSync(path.join(root, "implement.mjs"), 'import fs from "node:fs"; fs.writeFileSync("implementation-sentinel", "done");');
  json(root, "command.json", { script: "implement.mjs", args: [], timeoutMs: 3000, cleanupMs: 600 });
  const denied = cli(root, "dispatch-implementation", [id, "command.json"], { TASK_PLAN_FILE: context(root, id) });
  assert.equal(denied.status, 1);
  assert.equal(fs.existsSync(path.join(root, "implementation-sentinel")), false);
  const dispatched = cli(root, "dispatch-implementation", [id, "command.json"],
    { TASK_PLAN_FILE: context(root, id), UNIFIED_CONTEXT_FILE: "native-context.json" });
  assert.equal(dispatched.status, 0, dispatched.stdout + dispatched.stderr);
  const dispatchedReport = JSON.parse(dispatched.stdout);
  assert.equal(dispatchedReport.hostAuthorization, "NOT_OBSERVED");
  assert.equal(dispatchedReport.quiescent, true);
  assert.equal(dispatchedReport.exit, 0);
  assert.equal(fs.readFileSync(path.join(root, "implementation-sentinel"), "utf8"), "done");
});
function cryptoFixtureId() { return "00000000-0000-4000-8000-000000000000"; }

// Independent exact commands: never derive the expected argv from the table
// being tested. These fixtures load real policy/plan/preflight/runner entry
// points on private roots but never execute any registered application step.
const ciSteps = [
  ["ci-required-results", "scripts/ci/check-required-results.test.mjs"],
  ["ci-api-coverage", "scripts/ci/api-test-coverage.test.mjs"],
  ["ci-browser-safety", "scripts/tests/browser-safety-lanes.test.mjs"],
].map(([name, file]) => ({
  name, cwd: ".", adapter: "node-tap",
  argv: ["node", "--test", "--test-reporter=tap", "--test-timeout=15000", file],
  retryPrefix: ["node", "--test", "--test-reporter=tap", "--test-timeout=15000", "--test-name-pattern"],
  retrySuffix: [file],
}));
function ciBefore() {
  const table = readJson(SOURCE, "docs/validation/evidence/ci-tiers-before.json");
  assert.equal(sha(JSON.stringify(table)), "58f3ec04fe58a55f769a55956e631116832fccfb6f1795e23d9d0ec4c06cd4ea");
  return table;
}
function assertCiDelta(root, table) {
  const prior = ciBefore();
  const unchanged = structuredClone(table);
  assert.deepEqual(unchanged.tiers["test-standard"].steps.splice(-3), ciSteps);
  assert.deepEqual(unchanged, prior, "Only the exact three standard steps may be appended");
  json(root, "docs/validation/unified-tiers.json", table);
  for (const name of TIERS) {
    const effective = tier(root, name);
    const expected = name === "test-fast" ? [] : ciSteps;
    assert.deepEqual(effective.steps.filter(s => ciSteps.some(c => c.name === s.name)), expected);
    for (const step of ciSteps) {
      assert.equal(effective.steps.filter(s => s.argv.includes(step.argv.at(-1))).length,
        name === "test-fast" ? 0 : 1, "Exact file must execute once, not via an alias or duplicate");
    }
    const old = prior.tiers[name];
    for (const field of ["target", "extends", "timeoutMs", "stepTimeoutMs", "cleanupMs"]) {
      assert.deepEqual(effective[field], old[field]);
    }
    assert.equal(effective.hash, sha(JSON.stringify(table)));
    assert.notEqual(effective.hash, sha(JSON.stringify(prior)), "Whole-table hashing changes fast too");
  }
}
let ciNativeRef = 700; // Synthetic linkage, confined to disposable registries.
function ciSpec(name = "test-standard", file = ciSteps[0].argv.at(-1), nativeTaskRef = "#" + ciNativeRef++) {
  const input = governedSpec({ tier: name, nativeTaskRef });
  input.regression.testLocation = file;
  input.regressionAssessment.coverage[0].testLocation = file;
  return input;
}

test("CI workload additions are explicit and inherited once", async t => {
  const root = governed(t);
  const table = readJson(SOURCE, "docs/validation/unified-tiers.json");
  assertCiDelta(root, table);
  // Reach real current-contract RG preflight for every file and inherited tier.
  // Higher tiers validate inclusion but remain execution-BLOCKED by capabilities.
  for (const name of TIERS) for (const step of ciSteps) {
    const id = provision(root, ciSpec(name, step.argv.at(-1)));
    const ctx = observed(root, id);
    if (name === "test-fast") {
      assert.throws(() => preflight(root, id, context(root, id), ctx), /not in the bound workload/);
      await assert.rejects(dispatch(root, id, context(root, id), ctx,
        () => fs.writeFileSync(path.join(root, "sentinel"), "unsafe")), /not in the bound workload/);
    } else {
      const result = preflight(root, id, context(root, id), ctx);
      assert.equal(result.assessment, "LOCAL_PLAN_VALID_HOST_CHECKS_REQUIRED");
      assert.equal(result.executionAvailability,
        name === "test-standard" ? "LOCAL_PREREQUISITES_AVAILABLE" : "BLOCKED");
      assert.equal(regressionPreflight(root, id, context(root, id), ctx.planHash,
        { context: ctx }).assessment, "PLAN_VALID_NOT_DELIVERY_OR_HOST_AUTHORIZATION");
    }
  }
  assert.equal(fs.existsSync(path.join(root, "sentinel")), false);
  // Safe negative controls cover each command independently, including alternate
  // names for duplicate files and changes only to retry/cwd/adapter/timeout.
  for (const step of ciSteps) for (const mutation of [
    "missing", "duplicate", "duplicate-file", "substituted", "retry", "cwd", "adapter", "timeout",
  ]) {
    const changed = structuredClone(table);
    const steps = changed.tiers["test-standard"].steps;
    const index = steps.findIndex(s => s.name === step.name);
    if (mutation === "missing") steps.splice(index, 1);
    if (mutation === "duplicate") steps.push(structuredClone(step));
    if (mutation === "duplicate-file") steps.push({ ...structuredClone(step), name: step.name + "-alias" });
    if (mutation === "substituted") steps[index].argv = ["node", "-e", "process.exit(0)"];
    if (mutation === "retry") steps[index].retrySuffix = ["different.test.mjs"];
    if (mutation === "cwd") steps[index].cwd = "scripts";
    if (mutation === "adapter") steps[index].adapter = "exit";
    if (mutation === "timeout") steps[index].argv[3] = "--test-timeout=16000";
    assert.throws(() => assertCiDelta(root, changed), assert.AssertionError, `${step.name}: ${mutation}`);
  }
});

test("CI workload additions preserve tier limits and prerequisites", t => {
  const root = fixture(t);
  const before = ciBefore();
  const after = readJson(SOURCE, "docs/validation/unified-tiers.json");
  assertCiDelta(root, after);
  assert.deepEqual(after.tiers["test-fast"], before.tiers["test-fast"]);
  for (const name of TIERS) {
    json(root, "docs/validation/unified-tiers.json", before);
    const prior = tier(root, name);
    json(root, "docs/validation/unified-tiers.json", after);
    const next = tier(root, name);
    assert.deepEqual(next.requires, prior.requires);
    assert.deepEqual(next.steps.filter(s => !ciSteps.some(c => c.name === s.name)), prior.steps);
  }
  assert.deepEqual(
    ["timeoutMs", "stepTimeoutMs", "cleanupMs"].map(k => after.tiers["test-standard"][k]),
    [900000, 300000, 10000]);
  assert.deepEqual(policy(root).capabilities, []);
});

test("CI definition changes reject stale context without rewriting history", async t => {
  const root = governed(t);
  const before = ciBefore();
  const after = readJson(SOURCE, "docs/validation/unified-tiers.json");
  json(root, "docs/validation/unified-tiers.json", before);
  const historical = provision(root, governedSpec());
  // An immutable tombstone is also part of the history, never recycled.
  const tombstone = provision(root, governedSpec({ nativeTaskRef: "#401" }));
  cancel(root, tombstone, "Disposable historical cancellation");
  const ids = TIERS.map(name => provision(root, ciSpec(name)));
  const snapshots = ids.map(id => observed(root, id));
  const registryFile = path.join(root, "docs/validation/unified-task-registry.json");
  const originalLedger = fs.readFileSync(registryFile);
  const plans = Object.values(registry(root).records).map(r =>
    [r.planPath, fs.readFileSync(path.join(root, r.planPath))]);
  json(root, "docs/validation/unified-tiers.json", after);
  const sentinel = path.join(root, "sentinel");
  for (const [i, id] of ids.entries()) {
    const ctx = snapshots[i];
    assert.throws(() => preflight(root, id, context(root, id), ctx), /definition changed/);
    await assert.rejects(dispatch(root, id, context(root, id), ctx,
      () => fs.writeFileSync(sentinel, "unsafe")), /definition changed/);
    await assert.rejects(run(root, id, TIERS[i], context(root, id), null, { context: ctx }), /definition changed/);
    for (const wrong of TIERS.filter(name => name !== TIERS[i])) {
      await assert.rejects(run(root, id, wrong, context(root, id), null, { context: ctx }), /Wrong contract/);
    }
  }
  assert.deepEqual(fs.readFileSync(registryFile), originalLedger);
  for (const [file, bytes] of plans) assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes);
  const historicRecord = JSON.stringify(registry(root).records[historical]);
  const tombstoneRecord = JSON.stringify(registry(root).records[tombstone]);
  const id = ids[1];
  amend(root, id, "test-standard", "Fixture-only covered CI workload amendment",
    ciSpec("test-standard", ciSteps[0].argv.at(-1), snapshots[1].nativeTaskRef),
    { context: snapshots[1], coordination });
  const ctx = observed(root, id);
  assert.equal(preflight(root, id, context(root, id), ctx).executionAvailability, "LOCAL_PREREQUISITES_AVAILABLE");
  await assert.rejects(dispatch(root, id, context(root, id), snapshots[1],
    () => fs.writeFileSync(sentinel, "unsafe")), /context|revision|mismatch/i);
  const amendedLedger = fs.readFileSync(registryFile);
  // Mutate every CI command against a valid current seal: neither a subset nor
  // a successful alias nor a duplicate can run against that bound definition.
  for (const step of ciSteps) for (const mutation of ["missing", "substituted", "duplicate", "duplicate-file"]) {
    const changed = structuredClone(after);
    const steps = changed.tiers["test-standard"].steps;
    const index = steps.findIndex(s => s.name === step.name);
    if (mutation === "missing") steps.splice(index, 1);
    if (mutation === "substituted") steps[index].argv = ["node", "-e", "process.exit(0)"];
    if (mutation === "duplicate") steps.push(structuredClone(step));
    if (mutation === "duplicate-file") steps.push({ ...structuredClone(step), name: step.name + "-alias" });
    json(root, "docs/validation/unified-tiers.json", changed);
    await assert.rejects(run(root, id, "test-standard", context(root, id), null, { context: ctx }),
      /definition changed|duplicate command/);
    await assert.rejects(dispatch(root, id, context(root, id), ctx,
      () => fs.writeFileSync(sentinel, "unsafe")), /definition changed|duplicate command/);
  }
  assert.equal(fs.existsSync(sentinel), false);
  assert.equal(fs.existsSync(path.join(root, ".local/failure-gate/runs")), false);
  assert.deepEqual(fs.readFileSync(registryFile), amendedLedger);
  assert.equal(JSON.stringify(registry(root).records[historical]), historicRecord);
  assert.equal(JSON.stringify(registry(root).records[tombstone]), tombstoneRecord);
  for (const [file, bytes] of plans) {
    if (file !== context(root, id)) assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes);
  }
});

test("Unified preparation fills concrete inspected gaps, selects adequate workload and reuses unchanged seals", t => {
  const root = governed(t);
  const full = governedSpec();
  const { regression, regressionAssessment, ...draft } = full;
  const inspection = { requiredSteps: ["work"], regression, regressionAssessment };
  const registryBefore = fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8");
  const candidate = prepare(root, draft, inspection);
  assert.equal(candidate.operation, "provision-required");
  assert.deepEqual(candidate.spec, full);
  assert.equal(fs.readFileSync(path.join(root, "docs/validation/unified-task-registry.json"), "utf8"), registryBefore);
  assert.throws(() => prepare(root, draft, { requiredSteps: ["work"] }), /regression/);
  assert.throws(() => prepare(root, draft, { ...inspection, requiredSteps: ["backup-not-covered"] }), /No registered adequate/);
  const id = provision(root, candidate.spec);
  const ctx = observed(root, id);
  const before = registry(root);
  assert.equal(prepare(root, full, inspection, { id, context: ctx }).operation, "reuse");
  assert.deepEqual(registry(root), before);
  const changed = { ...full, done: [...full.done, "A changed assertion remains scope reviewed."] };
  assert.equal(prepare(root, changed, inspection, { id, context: ctx }).operation, "amendment-required");
  assert.deepEqual(registry(root), before);
  assert.throws(() => prepare(root, { ...changed, nativeTaskRef: "#401" }, inspection, { id, context: ctx }), /native identity/);
  json(root, "candidate.json", { draft, inspection });
  const prepared = cli(root, "prepare-plan", ["candidate.json"]);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).operation, "provision-required");
  const tiers = readJson(root, "docs/validation/unified-tiers.json");
  tiers.tiers["test-standard-plus"].steps.push({ name: "database-only", cwd: ".", adapter: "exit", argv: ["node", "database.mjs"] });
  tiers.tiers["test-standard-plus"].requires = ["unavailable-database"];
  json(root, "docs/validation/unified-tiers.json", tiers);
  const adequate = prepare(root, full, { ...inspection, requiredSteps: ["database-only"] });
  assert.equal(adequate.spec.tier, "test-standard-plus"); // unavailable is not permission to lower coverage
});

test("Unified dispatch holds affected work quiescent, rejects stale resume and records amendment impact", async t => {
  const root = governed(t);
  const full = governedSpec();
  const id = provision(root, full);
  const ctx = observed(root, id);
  const saved = registry(root);
  assert.throws(() => amend(root, id, "test-fast", "Inspected amendment", full), /context/);
  assert.throws(() => amend(root, id, "test-fast", "Inspected amendment", full, { context: ctx }), /applicability/);
  assert.deepEqual(registry(root), saved);
  let releaseWork;
  const barrier = new Promise(resolve => { releaseWork = resolve; });
  let entered = false;
  const working = dispatch(root, id, context(root, id), ctx, async () => { entered = true; await barrier; });
  await waitFor(() => entered);
  assert.throws(() => amend(root, id, "test-fast", "Inspected amendment", full, { context: ctx, coordination }), /lock retained/);
  assert.throws(() => cancel(root, id, "Cancel affected fixture"), /lock retained/);
  await assert.rejects(run(root, id, "test-fast", context(root, id), null, { context: ctx }), /lock retained/);
  assert.deepEqual(registry(root), saved);
  releaseWork();
  await working;
  const changed = { ...full, done: [...full.done, "New requirement preserved after amendment."] };
  amend(root, id, "test-fast", "Inspected amendment", changed, { context: ctx, coordination });
  const after = registry(root).records[id];
  assert.notEqual(after.planHash, ctx.planHash);
  assert.deepEqual(after.runs, saved.records[id].runs);
  assert.deepEqual(after.events.find(e => e.kind === "amendment-start").coordination, coordination);
  await assert.rejects(dispatch(root, id, context(root, id), ctx, () => fs.writeFileSync(path.join(root, "sentinel"), "unsafe")), /Stale/);
  assert.equal(fs.existsSync(path.join(root, "sentinel")), false);
  assert.throws(() => amend(root, id, "test-fast", "A stale competing amendment", changed, { context: ctx, coordination }), /Stale/);
  const fresh = observed(root, id);
  await dispatch(root, id, context(root, id), fresh, () => fs.writeFileSync(path.join(root, "sentinel"), "observed"));
  assert.equal(fs.readFileSync(path.join(root, "sentinel"), "utf8"), "observed");
});

test("Unified runner and every CLI validation caller require current context; terminal identities stay denied", async t => {
  const root = governed(t, 'import fs from "node:fs"; fs.writeFileSync("sentinel", "ran");');
  const id = provision(root, governedSpec());
  const ctx = observed(root, id);
  for (const command of ["run-validation", "validation-tier", "validate-task-plans", "check-failure-gate"]) {
    const args = command === "run-validation" ? [id, "test-fast"] : command === "validation-tier" ? ["test-fast", id] : command === "check-failure-gate" ? [id] : [];
    const refused = cli(root, command, args, { TASK_PLAN_FILE: context(root, id), UNIFIED_TASK_ID: id });
    assert.equal(refused.status, 1, command + refused.stdout + refused.stderr);
    assert.equal(fs.existsSync(path.join(root, "sentinel")), false);
  }
  // Fresh processes and a separate checkout transport the exact sealed bytes,
  // including a non-ASCII/native newline payload, not a reconstructed renderer.
  json(root, "native-context.json", ctx);
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "unified-dispatch-checkout-"));
  t.after(() => fs.rmSync(copy, { recursive: true, force: true }));
  fs.cpSync(root, copy, { recursive: true });
  const accepted = cli(copy, "run-validation", [id, "test-fast"], { TASK_PLAN_FILE: context(copy, id), UNIFIED_CONTEXT_FILE: "native-context.json" });
  assert.equal(accepted.status, 0, accepted.stderr + accepted.stdout);
  const report = JSON.parse(accepted.stdout);
  assert.equal(report.state, "PASS");
  assert.equal(report.planHash, ctx.planHash);
  assert.equal(report.isolatedRetryOnly, false);
  assert.ok(report.implementation.some(f => f.file === "work.mjs" && f.hash));
  assert.equal(fs.existsSync(path.join(root, "sentinel")), false);
  assert.deepEqual(observed(copy, id), ctx);
  const second = provision(copy, governedSpec({ nativeTaskRef: "#401" }));
  cancel(copy, second, "Keep this independently consumed tombstone.");
  assert.equal(registry(copy).records[second].status, "cancelled");
  assertRegistryEvolution(registry(root), registry(copy));
  cancel(root, id, "Fixture task has closed.");
  await assert.rejects(dispatch(root, id, context(root, id), ctx, () => assert.fail("terminal work")), /non-executable/);
  await assert.rejects(run(root, id, "test-fast", context(root, id), null, { context: ctx }), /non-executable/);
  assert.throws(() => provision(root, governedSpec()), /already consumed/);
});

test("Unified amendments preserve native identity and actual CLI dispatch rejects stale context before any edit", t => {
  const root = governed(t);
  const full = governedSpec();
  const id = provision(root, full);
  const ctx = observed(root, id);
  json(root, "native-context.json", ctx);
  json(root, "replacement.json", { ...full, done: [...full.done, "Amended fixture scope stays identifiable."] });
  json(root, "coordination.json", coordination);
  const before = registry(root);
  assert.throws(() => amend(root, id, "test-fast", "Changing native identity is unsupported",
    { ...full, nativeTaskRef: "#401" }, { context: ctx, coordination }), /native identity/);
  assert.deepEqual(registry(root), before);
  const amended = cli(root, "amend-plan", [id, "test-fast", "Inspected concrete scope amendment", "replacement.json", "coordination.json"],
    { UNIFIED_CONTEXT_FILE: "native-context.json" });
  assert.equal(amended.status, 0, amended.stderr + amended.stdout);
  fs.writeFileSync(path.join(root, "implement.mjs"), 'import fs from "node:fs"; fs.writeFileSync("edit", "unsafe");');
  json(root, "command.json", { script: "implement.mjs", args: [], timeoutMs: 3000, cleanupMs: 600 });
  const stale = cli(root, "dispatch-implementation", [id, "command.json"],
    { TASK_PLAN_FILE: context(root, id), UNIFIED_CONTEXT_FILE: "native-context.json" });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /Stale/);
  assert.equal(fs.existsSync(path.join(root, "edit")), false);
  assert.equal(registry(root).records[id].spec.nativeTaskRef, "#400");
});

test("Unified preflight refuses uncertain work and malformed baseline without rewriting historical contracts", async t => {
  const root = governed(t);
  const id = provision(root, governedSpec());
  const ctx = observed(root, id);
  const held = lease(root, "target-fixture-repository");
  assert.throws(() => preflight(root, id, context(root, id), ctx), /lease retained/);
  held();
  const before = observed(root, id);
  json(root, "docs/validation/failure-baseline.json", { schemaVersion: 1 });
  await assert.rejects(dispatch(root, id, context(root, id), ctx, () => assert.fail("malformed baseline")), /Malformed baseline/);
  assert.deepEqual(observed(root, id), before);
  json(root, "docs/validation/failure-baseline.json", { schemaVersion: 1, entries: [] });
  const r = registry(root);
  // Simulate a crash after active-run publication, preserving required history.
  transaction(root, store => {
    store.records[id].activeRun = { runId: "uncertain", target: "fixture-repository" };
    store.records[id].runs.push({ runId: "uncertain", kind: "tier-run" });
  });
  assert.throws(() => preflight(root, id, context(root, id), ctx), /active or uncertain/);
  assert.throws(() => amend(root, id, "test-fast", "Cannot overlap uncertain work", r.records[id].spec,
    { context: ctx, coordination }), /active or uncertain/);
  assert.deepEqual(observed(root, id), before);
});

test("Unified current pin does not retrofit older bindings and only explicit amendment advances their contract", async t => {
  const root = currentFixture(t);
  const id = provision(root, governedSpec());
  const old = observed(root, id);
  const p = policy(root);
  fs.appendFileSync(path.join(root, p.canonicalSource), "\nDisposable revision fixture\n");
  p.canonicalSha256 = sha(fs.readFileSync(path.join(root, p.canonicalSource)));
  p.planTemplates[p.canonicalSha256] = "unified-v2";
  p.regressionGuard.contracts[p.canonicalSha256 + "/unified-v4"] = RG_REVISION;
  p.preflightContracts = [p.canonicalSha256];
  json(root, "docs/validation/unified-policy.json", p);
  assert.equal((await run(root, id, "test-fast", context(root, id))).state, "PASS");
  assert.deepEqual(observed(root, id), old);
  amend(root, id, "test-fast", "Explicitly adopt current approved fixture contract", null, { context: old, coordination });
  const fresh = observed(root, id);
  assert.equal(fresh.contract, p.canonicalSha256);
  await assert.rejects(run(root, id, "test-fast", context(root, id)), /context/);
  assert.equal((await run(root, id, "test-fast", context(root, id), null, { context: fresh })).state, "PASS");
  const before = registry(root);
  assert.equal(amend(root, id, "test-fast", registry(root).records[id].spec.why, null,
    { context: fresh, coordination }).operation, "reuse");
  assert.deepEqual(registry(root), before);
});

test("Unified separate-checkout reconciliation preserves independently consumed identities and exact sealed inputs", t => {
  const left = governed(t);
  const shared = provision(left, governedSpec());
  const right = fs.mkdtempSync(path.join(os.tmpdir(), "unified-independent-checkout-"));
  t.after(() => fs.rmSync(right, { recursive: true, force: true }));
  fs.cpSync(left, right, { recursive: true });
  const leftId = provision(left, governedSpec({ nativeTaskRef: "#401" }));
  const rightId = provision(right, governedSpec({ nativeTaskRef: "#402" }));
  cancel(left, leftId, "Independent left cancellation remains consumed.");
  cancel(right, rightId, "Independent right cancellation remains consumed.");
  const l = registry(left), r = registry(right);
  assert.notEqual(leftId, rightId);
  const union = { ...l, revision: Math.max(l.revision, r.revision) + 1, records: { ...l.records, ...r.records } };
  assertRegistryEvolution(l, union);
  assertRegistryEvolution(r, union);
  const lost = structuredClone(union); delete lost.records[leftId];
  assert.throws(() => assertRegistryEvolution(l, lost), /dropped ID/);
  for (const root of [left, right]) {
    json(root, "docs/validation/unified-task-registry.json", union);
    assert.equal(registry(root).records[leftId].status, "cancelled");
    assert.equal(registry(root).records[rightId].status, "cancelled");
  }
  const ctx = observed(left, shared);
  // Prove missing ignored local plan delivery uses exact payload bytes, not a
  // replacement identity or a normalization/rendering operation.
  fs.unlinkSync(path.join(right, context(right, shared)));
  json(right, "native-context.json", ctx);
  assert.equal(cli(right, "check-unified-preflight", [shared],
    { TASK_PLAN_FILE: context(right, shared), UNIFIED_CONTEXT_FILE: "native-context.json" }).status, 1);
  fs.writeFileSync(path.join(right, context(right, shared)), ctx.nativeSealedText, { flag: "wx" });
  const checked = cli(right, "check-unified-preflight", [shared],
    { TASK_PLAN_FILE: context(right, shared), UNIFIED_CONTEXT_FILE: "native-context.json" });
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(observed(right, shared), ctx);
  assert.equal(Object.keys(registry(right).records).length, 3);
});

test("Unified gate-source changes cannot turn an observed raw command pass into current validation PASS", async t => {
  const root = governed(t, 'import fs from "node:fs"; fs.appendFileSync("scripts/failure-gate/context.mjs", "\\nexport const fixtureChange = true;\\n");');
  const id = provision(root, governedSpec());
  const result = await run(root, id, "test-fast", context(root, id), null, { context: observed(root, id) });
  assert.equal(result.steps[0].exit, 0);
  assert.equal(result.rawAllPassed, true);
  assert.equal(result.state, "INCOMPLETE");
  assert.equal(result.changedGateSources[0].file, "scripts/failure-gate/context.mjs");
  assert.equal(registry(root).records[id].assessment.state, "INCOMPLETE");
});
test("output bounds cannot report PASS or leave fixture children running", async t => {
  const root = fixture(t, 'process.stdout.write("x".repeat(2000000));setInterval(()=>{},100);');
  const id = provision(root, spec());
  const report = await run(root, id, "test-fast", context(root, id));
  assert.equal(report.state, "INCOMPLETE");
  assert.equal(report.steps[0].blocked, "output-cap");
  assert.equal(report.steps[0].quiescent, true);
});
