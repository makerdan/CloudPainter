import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { scanText, scanRepository } from "../runtime-port-policy.mjs";

// Deliberate policy violations are assembled as input data, not executable
// ports in this test runner. Every input is scanned unmodified by scanText.
const literalPort = String(43000 + 17);
const url = "http://" + "127.0.0.1:" + literalPort + "/";
const rejects = (file, text) => assert.ok(scanText(file, text).findings.length, file + " must reject " + text);
const accepts = (file, text) => assert.deepEqual(scanText(file, text).findings, [], file + " must accept");

test("RG-RUNTIME-01 rejects hardcoded binds, aliases, object options and environment fallbacks", () => {
  for (const code of [
    `server.listen(${literalPort});`,
    `const port = ${literalPort}; server.listen(port);`,
    `const port = Number(process.env.PORT || ${literalPort}); server.listen(port);`,
    `server.listen({port: ${literalPort}});`,
    `export default {server: {port: ${literalPort}}};`,
  ]) rejects("src/server.ts", code);
  rejects("worker.py", `server.bind(('127.0.0.1', ${literalPort}))`);
  rejects("run.sh", `PORT=${literalPort} node server.js`);
  rejects("run.sh", `vite --port ${literalPort}`);
  rejects("src/server.ts", `server.listen(0); const x = ${JSON.stringify(url)};`);
});

test("RG-RUNTIME-01 rejects executable and test URLs across config, scripts, workflows and docs", () => {
  for (const file of ["tests/network.test.ts", "vite.config.ts", "package.json", ".github/workflows/unit.yml", ".replit"]) {
    rejects(file, `TEST_URL: "${url}"`);
  }
  rejects("README.md", "```sh\ncurl " + url + "\n```");
  rejects("docs/operations.md", "Run `curl " + url + "` to check readiness.");
  rejects("docs/operations.md", "Run `curl " + url + "` and confirm the readiness check passed.");
  rejects("tests/not-a-fixture.test.mjs", `fetch(${JSON.stringify(url)})`);
  const finding = scanText("server.js", `// first line\nserver.listen(${literalPort})`).findings[0];
  assert.deepEqual({ file: finding.file, line: finding.line }, { file: "server.js", line: 2 });
});

test("RG-RUNTIME-01 accepts environment configuration and explicit examples, not blanket numeric literals", () => {
  accepts("src/server.ts", "const port = Number(process.env.PORT); server.listen(port);");
  accepts("vite.config.ts", "export default {server: {port: Number(process.env.PORT)}};");
  accepts("run.sh", 'curl "$TEST_URL"; PORT="$PORT" node server.js');
  accepts("docs/operations.md", "```sh example\ncurl " + url + "\n```");
  rejects("docs/operations.md", "```sh\ncurl " + url + "\n```");
  accepts("src/server.ts", `// server.listen(${literalPort})\nserver.listen(Number(process.env.PORT));`);
  rejects("src/server.ts", `server.listen(${literalPort}); // environment example`);
  rejects("src/server.ts", "fetch('http://" + "127.0.0.1:0/')");
});

test("RG-RUNTIME-01 narrow platform/data rules do not exempt adjacent executable code or other files", () => {
  accepts("artifacts/app/.replit-artifact/artifact.toml", `localPort = ${literalPort}\nPORT = "${literalPort}"`);
  rejects("artifacts/app/.replit-artifact/artifact.toml", `run = "node server.js --port ${literalPort}"`);
  rejects("run.toml", `localPort = ${literalPort}`);
  const data = "http://" + "127.0.0.1:" + String(4173) + "/api/images/generate?prompt=private";
  accepts("scripts/tests/browser-safety-lanes.test.mjs", `request: () => ({ url: () => '${data}' }),`);
  rejects("scripts/tests/browser-safety-lanes.test.mjs", `fetch('${data}');`);
  rejects("scripts/tests/other.test.mjs", `fetch('${data}');`);
  rejects("scripts/tests/browser-safety-lanes.test.mjs", `const sample = '${data}extra';`);
  const shared = "postgresql://" + "fixture-user:fixture-password@shared-db.invalid:" + String(5432) + "/shared";
  accepts("scripts/ci/api-test-coverage.test.mjs", `const sharedTarget = '${shared}';`);
  rejects("scripts/ci/api-test-coverage.test.mjs", `connect('${shared}');`);
  const invalidImage = "https://" + "pfst.cf2.poecdn.net:" + String(8443) + "/image.png)";
  accepts("artifacts/api-server/tests/logo-images.test.ts", `poeReply("![bad](${invalidImage}"),`);
  rejects("artifacts/api-server/tests/logo-images.test.ts", `fetch("${invalidImage}");`);
});

test("RG-RUNTIME-01 actual ephemeral reservation is accepted and remains held until confirmed close", async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    assert.ok(server.listening);
    assert.ok(server.address().port > 0);
    accepts("tests/reservation.mjs", 'server.listen(0, "127.0.0.1", ready);');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  assert.equal(server.listening, false);
});

test("RG-RUNTIME-01 repository inventory includes untracked relevant files and fails closed on unsafe inputs", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-port-scan-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const init = spawnSync("git", ["init", "-q", root], { encoding: "utf8", timeout: 5000 });
  assert.equal(init.status, 0, init.stderr);
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, ".github/workflows/runtime.yml"), `run: curl ${url}\n`);
  fs.writeFileSync(path.join(root, "server.ts"), "server.listen(Number(process.env.PORT));");
  const report = scanRepository(root);
  assert.equal(report.files, 2);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].file, ".github/workflows/runtime.yml");
  fs.symlinkSync(path.join(root, "server.ts"), path.join(root, "unsafe.ts"));
  assert.throws(() => scanRepository(root), /symlink/);
  fs.unlinkSync(path.join(root, "unsafe.ts"));
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored.ts\n");
  fs.writeFileSync(path.join(root, "ignored.ts"), `server.listen(${literalPort})`);
  assert.equal(scanRepository(root).findings.length, 1);
});
