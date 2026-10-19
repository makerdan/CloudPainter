import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { supervise, run } from "../failure-gate/runner.mjs";
import { provision } from "../failure-gate/plans.mjs";
import { atomicJson, sha, TIERS, lease } from "../failure-gate/store.mjs";

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
const identity = pid => {
  try {
    const fields = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
    return fields[0] === "Z" ? null : { pid, start: fields[19] };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error; // Incomplete discovery never means stopped.
  }
};
const survives = record => identity(record.pid)?.start === record.start;
async function until(check, limit = 8000) {
  const end = performance.now() + limit;
  while (!check()) {
    if (performance.now() >= end) throw new Error("Owned fixture observation deadline exceeded");
    await delay(25);
  }
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-lifecycle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts/tests/fixtures"), { recursive: true });
  fs.cpSync(path.join(SOURCE, "scripts/failure-gate"), path.join(root, "scripts/failure-gate"), { recursive: true });
  fs.copyFileSync(path.join(SOURCE, "scripts/tests/fixtures/runtime-child.mjs"), path.join(root, "scripts/tests/fixtures/runtime-child.mjs"));
  return root;
}
const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
async function request(port) {
  return await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let data = "";
    socket.setTimeout(1000, () => socket.destroy(new Error("Readiness request deadline")));
    socket.on("data", chunk => { data += chunk; });
    socket.on("error", reject);
    socket.on("end", () => resolve(data));
  });
}
async function assertReleased(port) {
  const next = net.createServer();
  await new Promise((resolve, reject) => {
    next.once("error", reject);
    next.listen(port, "127.0.0.1", resolve);
  });
  await close(next);
}
async function sentinel(t, root) {
  const manifest = path.join(root, "sentinel.json");
  const child = spawn(process.execPath, ["scripts/tests/fixtures/runtime-child.mjs", "sentinel", manifest], {
    cwd: root, stdio: "ignore", env: { PATH: process.env.PATH },
  });
  const stopped = new Promise(resolve => child.once("exit", resolve));
  t.after(async () => {
    child.kill("SIGTERM"); // Only this test's intentionally owned sentinel.
    await bounded(stopped, 3000, "Sentinel cleanup deadline");
  });
  await until(() => fs.existsSync(manifest));
  const record = JSON.parse(fs.readFileSync(manifest)).parent;
  assert.equal(record.ready, true);
  assert.equal(await request(record.port), "runtime-fixture\n");
  return record;
}

test("RG-RUNTIME-02 concurrent live reservations, observed readiness, collision denial and confirmed close", async () => {
  const first = net.createServer(socket => socket.end("first\n"));
  const second = net.createServer(socket => socket.end("second\n"));
  const ports = await Promise.all([listen(first), listen(second)]);
  try {
    assert.notEqual(ports[0], ports[1]);
    assert.equal(first.listening && second.listening, true);
    assert.deepEqual(await Promise.all(ports.map(request)), ["first\n", "second\n"]);
    const collision = net.createServer();
    const denied = new Promise(resolve => collision.once("error", resolve));
    collision.listen(ports[0], "127.0.0.1");
    assert.equal((await denied).code, "EADDRINUSE");
    assert.equal(collision.listening, false);
    assert.equal(await request(ports[0]), "first\n"); // The original owner is intact.
    assert.equal(first.listening, true);
  } finally {
    await Promise.all([close(first), close(second)]);
  }
  assert.equal(first.listening || second.listening, false);
  await Promise.all(ports.map(assertReleased));
});

for (const mode of ["failure", "timeout"]) {
  test(`RG-RUNTIME-03 ${mode}: real supervisor terminates ready owned descendants without touching unrelated listener`, async t => {
    const root = fixture(t);
    const unrelated = await sentinel(t, root);
    const manifest = path.join(root, "owned.json");
    const started = performance.now();
    // This is an execution deadline with generous startup allowance, not a
    // queue deadline or a 200ms startup assumption. Readiness is required below.
    const result = supervise(root, {
      cwd: ".", argv: ["node", "scripts/tests/fixtures/runtime-child.mjs", mode, manifest],
    }, mode === "timeout" ? 4000 : 12000, 1500, "owned.log");
    await until(() => fs.existsSync(manifest));
    const records = JSON.parse(fs.readFileSync(manifest));
    assert.equal(records.child.ready, true);
    if (mode === "timeout") assert.equal(await request(records.child.port), "runtime-fixture\n");
    const report = await result;
    assert.equal(report.quiescent, true, JSON.stringify(report));
    assert.equal(report.blocked, mode === "timeout" ? "timeout" : null);
    if (mode === "failure") assert.equal(report.exit, 7);
    assert.ok(performance.now() - started < 16000);
    assert.equal(survives(records.parent), false);
    assert.equal(survives(records.child), false);
    await assertReleased(records.child.port);
    assert.equal(survives(unrelated), true);
    assert.equal(await request(unrelated.port), "runtime-fixture\n");
    console.log(JSON.stringify({ scenario: mode, dispatchedReady: true, cleanup: report, ownedStopped: true, unrelatedPreserved: true }));
  });
}

test("RG-RUNTIME-03 cancellation: actual supervising-parent loss cleans ready owned tree within deadline", async t => {
  const root = fixture(t);
  const unrelated = await sentinel(t, root);
  const manifest = path.join(root, "cancel.json");
  const supervisor = path.join(root, "scripts/failure-gate/supervisor.py");
  const command = ["node", "scripts/tests/fixtures/runtime-child.mjs", "cancel", manifest];
  const wrapperSource = `
    const {spawn}=require("node:child_process");
    const fs=require("node:fs");
    const c=spawn("python3", ${JSON.stringify([supervisor, "12000", "1500", path.join(root, "cancel.log"), JSON.stringify(command)])},
      {detached:true,stdio:["ignore",process.stdout,process.stderr]});
    fs.writeFileSync("supervisor.pid",String(c.pid));
    setInterval(()=>{},1000);
  `;
  const wrapper = spawn(process.execPath, ["-e", wrapperSource], {
    cwd: root, env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "", errors = "";
  wrapper.stdout.on("data", data => { output += data; });
  wrapper.stderr.on("data", data => { errors += data; });
  const ended = new Promise(resolve => wrapper.once("close", resolve));
  // Failure teardown is also owned and finite; the tier supervisor remains
  // outside these fixtures and retains responsibility for unexpected survivors.
  t.after(() => { if (identity(wrapper.pid)) wrapper.kill("SIGKILL"); });
  await until(() => fs.existsSync(manifest));
  const records = JSON.parse(fs.readFileSync(manifest));
  const supervisorIdentity = identity(Number(fs.readFileSync(path.join(root, "supervisor.pid"))));
  assert.ok(supervisorIdentity);
  assert.equal(records.child.ready, true);
  assert.equal(await request(records.child.port), "runtime-fixture\n");
  const cancelledAt = performance.now();
  wrapper.kill("SIGKILL"); // This fixture alone; not a service or pre-existing listener.
  await bounded(ended, 6000, "Cancelled fixture cleanup deadline");
  const report = JSON.parse(output.trim());
  assert.equal(report.blocked, "supervising-parent-lost", errors);
  assert.equal(report.quiescent, true);
  assert.ok(performance.now() - cancelledAt < 6000);
  assert.equal(survives(records.parent), false);
  assert.equal(survives(records.child), false);
  assert.equal(survives(supervisorIdentity), false);
  await assertReleased(records.child.port);
  assert.equal(survives(unrelated), true);
  assert.equal(await request(unrelated.port), "runtime-fixture\n");
  console.log(JSON.stringify({ scenario: "cancellation", dispatchedReady: true, cleanup: report, ownedStopped: true, unrelatedPreserved: true }));
});

test("RG-RUNTIME-03 actual discovery error retains gate protection; queue refusal cannot dispatch", async t => {
  const root = fixture(t);
  const canonical = fs.readFileSync(path.join(SOURCE, ".agents/skills/failure-gate-unified/SKILL.md"));
  fs.mkdirSync(path.join(root, ".agents/skills/failure-gate-unified"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents/skills/failure-gate-unified/SKILL.md"), canonical);
  atomicJson(root, "docs/validation/unified-policy.json", {
    schemaVersion: 1, mode: "active", projectId: "runtime-fixture",
    canonicalSource: ".agents/skills/failure-gate-unified/SKILL.md", canonicalSha256: sha(canonical),
    planTemplates: { [sha(canonical)]: "unified-v2" }, newPlanTemplate: "unified-v3",
    capabilities: [], legacyNativeTasks: [],
    regressionGuard: { contracts: { [sha(canonical) + "/unified-v3"]: "legacy-v1" } },
  });
  atomicJson(root, "docs/validation/unified-task-registry.json", { schemaVersion: 1, projectId: "runtime-fixture", revision: 0, records: {} });
  atomicJson(root, "docs/validation/failure-baseline.json", { schemaVersion: 1, entries: [] });
  const tier = { target: "runtime-fixture", timeoutMs: 15000, stepTimeoutMs: 12000, cleanupMs: 1500, requires: [],
    steps: [{ name: "owned", cwd: ".", adapter: "exit", argv: ["node", "work.mjs"] }] };
  atomicJson(root, "docs/validation/unified-tiers.json", { schemaVersion: 1, tiers: Object.fromEntries(TIERS.map(name => [name, tier])) });
  fs.writeFileSync(path.join(root, "work.mjs"), 'import fs from "node:fs"; fs.writeFileSync("dispatched","yes");');
  const id = provision(root, {
    title: "Runtime discovery fixture", tier: "test-standard", what: "Exercise owned-work discovery failure.",
    why: "Disposable real-supervisor boundary", coverageEvidence: "work.mjs is explicitly registered.",
    done: ["Unknown discovery retains exclusion."], outOfScope: ["Live project state."],
    steps: ["Use isolated process observation and gate target lease."], relevantFiles: ["work.mjs"],
    regression: { covers: "Unknown process discovery", testLocation: "work.mjs", checks: "Denies redispatch while retained." }, baselines: [],
  });
  const plan = ".local/tasks/" + id + ".md";
  const release = lease(root, "target-runtime-fixture");
  await assert.rejects(run(root, id, "test-standard", plan), /lock retained/);
  assert.equal(fs.existsSync(path.join(root, "dispatched")), false);
  release(); // This fixture's known, undispatched lease only.
  // A directory at a proc stat path causes a real IsADirectoryError in the
  // production discovery function. No synthetic quiescent boolean is supplied.
  const fakeProc = path.join(root, "unreadable-proc");
  fs.mkdirSync(path.join(fakeProc, "123/stat"), { recursive: true });
  const source = fs.readFileSync(path.join(root, "scripts/failure-gate/supervisor.py"), "utf8");
  fs.writeFileSync(path.join(root, "scripts/failure-gate/supervisor.py"),
    source.replace('Path("/proc").glob', `Path(${JSON.stringify(fakeProc)}).glob`));
  const report = await run(root, id, "test-standard", plan);
  assert.equal(fs.readFileSync(path.join(root, "dispatched"), "utf8"), "yes");
  assert.equal(report.state, "INCOMPLETE");
  assert.equal(report.steps[0].quiescent, false);
  assert.match(report.steps[0].diagnostic, /discovery incomplete/);
  const lock = path.join(root, ".local/failure-gate/locks/target-runtime-fixture");
  assert.equal(fs.existsSync(lock), true);
  await assert.rejects(run(root, id, "test-standard", plan), /lock retained|active or uncertain/);
  assert.equal(fs.existsSync(lock), true);
  console.log(JSON.stringify({ scenario: "discovery-error", dispatched: true, state: report.state, protected: true }));
  // No recovery or unlink is attempted. Only the private test root is disposed.
});
