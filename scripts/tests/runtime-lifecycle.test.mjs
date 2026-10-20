import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { supervise, run } from "../failure-gate/runner.mjs";
import { provision } from "../failure-gate/plans.mjs";
import { atomicJson, sha, TIERS, lease } from "../failure-gate/store.mjs";
import http from "node:http";
import { startOwnedServer, startCloudPainterTestServer } from "../runtime/owned-server.mjs";
import { checkReady, waitReady } from "../runtime/readiness.mjs";

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ownedWorker = path.join(SOURCE, "scripts/tests/fixtures/owned-service.mjs");
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

test("actual harness adapters allocate concurrently and handle held collisions", async t => {
  const servers = [];
  t.after(async () => { await Promise.all(servers.map(s => s.stop())); });
  const results = await Promise.allSettled([
    startCloudPainterTestServer({ options: { basePath: "/runtime-proof/" } }),
    startCloudPainterTestServer(),
  ]);
  for (const result of results) if (result.status === "fulfilled") servers.push(result.value);
  assert.equal(servers.length, 2, JSON.stringify(results.map(r => r.reason?.message)));
  assert.notEqual(servers[0].port, servers[1].port);
  for (const server of servers) {
    assert.ok(server.registered.start);
    await checkReady(server.url, {
      kind: "cloudpainter", basePath: new URL(server.url).pathname,
    });
  }
  const holder = http.createServer((_req, res) => res.end("sentinel"));
  const port = await listen(holder);
  try {
    for (const app of ["cloudpainter", "mockup-sandbox"]) for (const preview of [false, true]) {
      // No inline strictPort override: this must be enforced by each real config.
      await assert.rejects(startOwnedServer({
        options: { appDirectory: path.join(SOURCE, "artifacts", app), heldPort: port, preview },
        startupMs: 8000,
      }));
    }
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).text(), "sentinel");
    // Canonical inventory is read-only and must identify this as busy, not FREE.
    const inventory = spawn(process.execPath, [".agents/skills/port-authority/scripts/free-ports.mjs", String(port)], {
      cwd: SOURCE, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    inventory.stdout.on("data", data => { output += data; });
    assert.equal(await new Promise(resolve => inventory.once("close", resolve)), 3);
    assert.equal(JSON.parse(output).state, "PROTECTED_BUSY");
    assert.ok(JSON.parse(output).holders.some(p => p.pid === process.pid));
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).text(), "sentinel");
  } finally { await close(holder); }
  for (const file of ["photo-export.browser.test.mjs", "outline-subject-regression.browser.mjs"]) {
    const source = fs.readFileSync(path.join(SOURCE, "artifacts/cloudpainter/tests", file), "utf8");
    assert.match(source, /import \{ startCloudPainterTestServer \} from '\.\.\/\.\.\/\.\.\/scripts\/runtime\/owned-server.mjs'/);
    assert.match(source, /ownedServer = await startCloudPainterTestServer\(\)/);
    assert.match(source, /finally \{ await ownedServer\?\.stop\(\); \}/);
    assert.doesNotMatch(source, /findAvailablePort|waitForApp|process\.kill|spawn\(/);
  }
  const external = fs.readFileSync(path.join(SOURCE, "artifacts/cloudpainter/playwright.config.ts"), "utf8");
  assert.match(external, /process\.env\.CLOUDPAINTER_TEST_URL/);
  assert.doesNotMatch(external, /webServer:|startOwned|process\.kill/);
  for (const server of servers) {
    const report = await server.stop();
    assert.equal(report.quiescent, true);
    assert.equal(survives(server.registered), false);
    await assertReleased(server.port);
  }
});

test("real service readiness rejects hangs redirects and wrong responses", async () => {
  const api = await startOwnedServer({ worker: ownedWorker, options: { mode: "api" }, kind: "api" });
  try {
    assert.equal(new URL(api.url).pathname, "/api/healthz");
    await checkReady(api.url, { kind: "api" });
    await assert.rejects(checkReady(api.url, { kind: "cloudpainter" }));
  } finally { assert.equal((await api.stop()).quiescent, true); }
  for (const mode of ["hang", "redirect", "wrong", "json"]) {
    const server = http.createServer((_req, res) => {
      if (mode === "hang") return;
      if (mode === "redirect") { res.writeHead(302, { Location: "/" }); res.end(); return; }
      res.setHeader("content-type", mode === "json" ? "application/json" : "text/html");
      res.end(mode === "json" ? '{"status":"other"}' : "<html>not this service</html>");
    });
    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/api/healthz`;
    const started = performance.now();
    try {
      for (const kind of ["api", "cloudpainter"]) {
        await assert.rejects(waitReady(url, { kind, startupMs: 450, requestMs: 100 }));
      }
      assert.ok(performance.now() - started < 2200);
    } finally { server.closeAllConnections(); await close(server); }
  }
  // Every response component matters independently; wrong status and extra JSON
  // cannot be hidden by a valid-looking body or application/json header.
  for (const [status, type, body] of [
    [503, "application/json", '{"status":"ok"}'],
    [200, "text/html", '{"status":"ok"}'],
    [200, "application/json", '{"status":"ok","other":true}'],
    [200, "application/json", "not-json"],
  ]) {
    const server = http.createServer((_req, res) => { res.writeHead(status, { "content-type": type }); res.end(body); });
    const port = await listen(server);
    try { await assert.rejects(checkReady(`http://127.0.0.1:${port}/api/healthz`, { kind: "api" })); }
    finally { await close(server); }
  }
});

test("actual owned lifecycle cleans failed cancelled and timed-out descendants", async t => {
  const unrelated = http.createServer((_req, res) => res.end("unrelated"));
  const port = await listen(unrelated);
  t.after(() => close(unrelated));
  for (const mode of ["descendant", "late-descendant", "fail-after-ready", "cancel", "timeout"]) {
    const controller = new AbortController();
    const service = await startOwnedServer({
      worker: ownedWorker, signal: controller.signal,
      options: { mode: ["cancel", "timeout"].includes(mode) ? "descendant" : mode },
      lifetimeMs: mode === "timeout" ? 4000 : 20000, startupMs: 3000, cleanupMs: 1600,
    });
    assert.ok(service.events.find(e => e.event === "registered"));
    const ready = service.events.find(e => e.event === "listening");
    assert.ok(ready.pid && ready.start);
    await checkReady(service.url, { kind: "cloudpainter" }); // Actual dispatch before failure.
    if (mode === "fail-after-ready" || mode === "timeout") {
      await until(() => service.events.some(e => e.event === "finished"), 8000);
      await assert.rejects(service.stop());
      const report = service.events.find(e => e.event === "finished");
      assert.equal(report.reason, mode === "timeout" ? "execution-timeout" : "child-exit");
      if (mode === "fail-after-ready") assert.equal(report.rawExit, 7);
    } else if (mode === "cancel") {
      controller.abort();
      await assert.rejects(service.stop());
    } else assert.equal((await service.stop()).quiescent, true);
    assert.equal(service.events.find(e => e.event === "finished").quiescent, true);
    assert.equal(survives(ready), false);
    assert.equal(survives(service.registered), false);
    await assertReleased(service.port);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).text(), "unrelated");
  }
  await assert.rejects(startOwnedServer({ worker: ownedWorker, options: { mode: "fail-before-listen" }, startupMs: 3000, lifetimeMs: 8000 }));
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(startOwnedServer({ signal: aborted.signal }));
});

test("actual adapter owner loss stops registered work and discovery errors never authorize release", async t => {
  const root = fixture(t);
  const unrelated = await sentinel(t, root);
  const manifest = path.join(root, "adapter-owner.json");
  const moduleUrl = pathToFileURL(path.join(SOURCE, "scripts/runtime/owned-server.mjs")).href;
  const wrapper = spawn(process.execPath, ["--input-type=module", "-e", `
    import fs from "node:fs";
    const {startOwnedServer}=await import(${JSON.stringify(moduleUrl)});
    const s=await startOwnedServer({worker:${JSON.stringify(ownedWorker)}, options:{mode:"descendant"}});
    fs.writeFileSync(${JSON.stringify(manifest)}, JSON.stringify({registered:s.registered,ready:s.events.find(e=>e.event==="listening"),port:s.port}));
  `], { cwd: SOURCE, env: { PATH: process.env.PATH, NODE_ENV: "test" }, stdio: "ignore" });
  t.after(() => { if (identity(wrapper.pid)) wrapper.kill("SIGKILL"); });
  await until(() => fs.existsSync(manifest));
  const observed = JSON.parse(fs.readFileSync(manifest));
  assert.equal(await (await fetch(`http://127.0.0.1:${observed.port}`, { signal: AbortSignal.timeout(1000) })).status, 200);
  wrapper.kill("SIGTERM"); // Exact intentionally created owner, never a live app.
  await until(() => !survives(observed.registered.supervisor), 6000);
  assert.equal(survives(observed.registered), false);
  assert.equal(survives(observed.ready), false);
  await assertReleased(observed.port);
  assert.equal(await request(unrelated.port), "runtime-fixture\n");

  // The real adapter/supervisor executes unchanged in a private root; its
  // imported discovery provider encounters an actual post-readiness I/O error.
  fs.cpSync(path.join(SOURCE, "scripts/runtime"), path.join(root, "scripts/runtime"), { recursive: true });
  const marker = path.join(root, "discovery-marker");
  const provider = path.join(root, "scripts/failure-gate/supervisor.py");
  fs.writeFileSync(provider, fs.readFileSync(provider, "utf8").replace(
    "def descendants():", `def descendants():\n    if Path(${JSON.stringify(marker)}).exists():\n        Path(${JSON.stringify(root)}).read_text()`,
  ));
  const { startOwnedServer: isolated } = await import(pathToFileURL(path.join(root, "scripts/runtime/owned-server.mjs")));
  const service = await isolated({
    worker: ownedWorker, options: { discoveryMarker: marker }, cleanupMs: 1500,
  });
  const ready = service.events.find(e => e.event === "listening");
  await checkReady(service.url, { kind: "cloudpainter" }); // Before injecting failure.
  await until(() => service.events.some(e => e.event === "finished"));
  await assert.rejects(service.stop(), /non-success/);
  const finished = service.events.find(e => e.event === "finished");
  assert.equal(finished.reason, "discovery-or-protocol-error");
  assert.equal(finished.quiescent, false);
  assert.equal(fs.existsSync(service.directory), true);
  assert.equal(survives(ready), false); // Known-owned best-effort cleanup is not healthy release.
  await assertReleased(service.port);
  assert.equal(await request(unrelated.port), "runtime-fixture\n");
});
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
