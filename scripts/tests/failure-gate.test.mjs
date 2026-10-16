import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { provision, checkPlan, amend, cancel, render } from "../failure-gate/plans.mjs";
import { run, parseFailures, evaluateFailures, selfClassify, closeOwnerDirection } from "../failure-gate/runner.mjs";
import { registry, readJson, atomicJson, lease, sha, TIERS, baseline, warnings, safePath, policy } from "../failure-gate/store.mjs";
import { transaction } from "../failure-gate/store.mjs";
import { recoveryPreview } from "../failure-gate/recovery.mjs";
import { assertRegistryEvolution } from "../failure-gate/merge-guard.mjs";

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.REPL_ID ??= "private-fixture";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (root, file, value) => atomicJson(root, file, value);
const context = (root, id) => registry(root).records[id].planPath;
const spec = (tier = "test-fast", extra = {}) => ({
  title: "Private fixture task", tier, why: "Exercise the fixture's bounded command",
  coverageEvidence: "docs/validation/unified-tiers.json fixture work; node scripts/run-validation.mjs ID " + tier,
  what: "Verify local gate invariants using disposable files only.",
  regression: { covers: "Wrong-tier execution and lost task identity", testLocation: "scripts/tests/failure-gate.test.mjs", checks: "Rejects mismatched tiers before child launch and retains allocated identities." },
  baselines: [], ...extra,
});
function fixture(t, work = 'console.log("ok")', adapter = "exit") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloudpainter-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.cpSync(path.join(SOURCE, "scripts/failure-gate"), path.join(root, "scripts/failure-gate"), { recursive: true });
  for (const entry of ["new-plan", "run-validation", "check-failure-gate", "amend-plan", "validation-tier", "validate-task-plans", "check-regression-guard"]) {
    fs.copyFileSync(path.join(SOURCE, "scripts/" + entry + ".mjs"), path.join(root, "scripts/" + entry + ".mjs"));
  }
  fs.mkdirSync(path.join(root, ".agents/skills/failure-gate-unified"), { recursive: true });
  const canonical = fs.readFileSync(path.join(SOURCE, ".agents/skills/failure-gate-unified/SKILL.md"));
  fs.writeFileSync(path.join(root, ".agents/skills/failure-gate-unified/SKILL.md"), canonical);
  json(root, "docs/validation/unified-policy.json", {
    schemaVersion: 1, mode: "active", projectId: process.env.REPL_ID,
    allocatorAuthorityVerified: true, canonicalSource: ".agents/skills/failure-gate-unified/SKILL.md",
    canonicalSha256: sha(canonical), planTemplates: { [sha(canonical)]: "unified-v2" },
    capabilities: [], legacyNativeTasks: [{ ref: "#2" }]
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
  json(root, "docs/validation/unified-policy.json", p);
  const oldSpec = spec(); delete oldSpec.coverageEvidence;
  const id = provision(root, oldSpec);
  const plan = context(root, id);
  const sealed = fs.readFileSync(path.join(root, plan), "utf8");
  assert.match(sealed, /Do not escalate/);
  fs.appendFileSync(path.join(root, p.canonicalSource), "\nFixture next revision\n");
  p.canonicalSha256 = sha(fs.readFileSync(path.join(root, p.canonicalSource)));
  p.planTemplates[p.canonicalSha256] = "unified-v2";
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
  assert.deepEqual(reports.map(r => r.state), ["PASS", "PASS"]);
});
test("output bounds cannot report PASS or leave fixture children running", async t => {
  const root = fixture(t, 'process.stdout.write("x".repeat(2000000));setInterval(()=>{},100);');
  const id = provision(root, spec());
  const report = await run(root, id, "test-fast", context(root, id));
  assert.equal(report.state, "INCOMPLETE");
  assert.equal(report.steps[0].blocked, "output-cap");
  assert.equal(report.steps[0].quiescent, true);
});
