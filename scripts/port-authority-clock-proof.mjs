// Code-owned, focused test-fast workload. The tier runner supplies admission,
// credential-free environment, 60s step/120s cumulative bounds and subreaper cleanup.
// Not a standalone authorization route; no live adapters or application callers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(root, "attached_assets/port-authority-unified-compatible_1792279619075.zip");
const digest = "d17fec4280ac00940eb3e58a5a15b92eae1a4704d5b57da1aaa470f9c18a2a77";
assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"), digest,
  "Only the inspected approved archive may supply fixture code");
const base = join(root, "generated-artifacts/port-authority-clock");
mkdirSync(base, { recursive: true });
const target = mkdtempSync(join(base, "proof-"));
for (const dir of ["scripts", "tests"]) mkdirSync(join(target, dir));
function member(name) {
  // Fixed code-owned member names; never extract arbitrary paths or run ZIP hooks.
  const r = spawnSync("unzip", ["-p", archive, name], {
    encoding: "utf8", timeout: 5000, maxBuffer: 200000,
  });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
for (const file of ["validation-lock.mjs", "runtime-environment.mjs", "host-capabilities.mjs", "free-ports.mjs"]) {
  writeFileSync(join(target, "scripts", file), member("scripts/" + file));
}
const original = member("tests/hardening.test.mjs");
const start = original.indexOf('test("wall-clock reversal cannot extend queue or execution elapsed limits"');
const end = original.indexOf('\ntest("late raw zero cannot win the execution deadline race"', start);
assert(start > 0 && end > start, "Approved original clock case must match");
const replacement = readFileSync(join(root, "scripts/fixtures/port-authority-clock-cases.mjs.txt"), "utf8");
let helpers = original.slice(0, original.indexOf('if (process.argv.includes("--supervised"))'));
assert(helpers.includes("function seedLease("), "Fixture helpers must include lease construction");
const teardown = "    rmSync(dir, { recursive: true, force: true });";
assert.equal(helpers.split(teardown).length, 2, "Exactly one private teardown site expected");
const retainedTeardown = `    if (existsSync(env.VALIDATION_LOCK_FILE)) {
      console.log(JSON.stringify({ incident: "private-lease-retained", stateDirectory: dir }));
    } else { rmSync(dir, { recursive: true, force: true }); }`;
helpers = helpers.replace(teardown, retainedTeardown);
// Keep a repaired copy for inspection/export, but do not execute unrelated tests.
writeFileSync(join(target, "tests/hardening.repaired.test.mjs"),
  (original.slice(0, start) + replacement + original.slice(end)).replace(teardown, retainedTeardown));
writeFileSync(join(target, "tests/clock-focused.test.mjs"), helpers + "\n" + replacement);
writeFileSync(join(target, "source.json"), JSON.stringify({
  archive: archive.slice(root.length + 1), sha256: digest,
  scope: "three focused private cases; not the full 75-test package or live activation",
  runtimeChanges: false, repairedCaseFile: "tests/hardening.repaired.test.mjs",
  runnerSha256: createHash("sha256").update(readFileSync(fileURLToPath(import.meta.url))).digest("hex"),
  casesSha256: createHash("sha256").update(replacement).digest("hex"),
}, null, 2) + "\n");
// Raw transcript and the repaired snapshot are retained in ignored generated output.
const run = spawnSync(process.execPath, [
  "--test", "--test-reporter=tap", "--test-timeout=15000",
  join(target, "tests/clock-focused.test.mjs"),
], { cwd: root, env: process.env, encoding: "utf8", timeout: 45000, maxBuffer: 900000 });
const output = (run.stdout ?? "") + (run.stderr ?? "");
writeFileSync(join(target, "proof.tap"), output);
process.stdout.write(output);
console.log("# private evidence: " + target.slice(root.length + 1));
if (run.error) console.error(run.error.message);
// Fail explicitly on timeout, missing/partial tests, skips or an unsuccessful child.
process.exitCode = !run.error && run.status === 0 &&
  /^# tests 3$/m.test(output) && /^# pass 3$/m.test(output) &&
  /^# fail 0$/m.test(output) && /^# skipped 0$/m.test(output) ? 0 : 1;
