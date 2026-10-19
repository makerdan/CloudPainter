import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cases = [
  "protocol_vector", "cli_contract", "inventory_order_and_bytes",
  "hostile_source", "manifest_strictness", "refresh_and_locked_load",
  "source_drift", "status_read_only", "status_hostile_metadata",
  "ignore_boundaries", "persistent_lock", "owner_recovery",
  "transaction_recovery", "uncertain_artifacts", "rollback",
  "rollback_uncertainty", "no_platform_authority", "fixture_only_writes",
];

test("workspace-skill/v1 exact root pnpm entrypoints", { timeout: 15_000 }, () => {
  for (const command of ["workspace-skill:refresh", "workspace-skill:status"]) {
    const run = (args) => spawnSync("pnpm", [command, "--", ...args], {
      cwd: root, encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    const version = run(["--contract-version"]);
    assert.equal(version.status, 0);
    assert.equal(version.stdout, "workspace-skill/v1\n");
    assert.equal(version.stderr, "");
    const missing = run(["--skill", "example"]);
    assert.equal(missing.status, 2);
    assert.equal(missing.stdout, '{"outcome":"unavailable-source","skillId":"example"}\n');
    assert.equal(missing.stderr, "source-unavailable\n");
  }
});

for (const name of cases) {
  test(`workspace-skill/v1 ${name}`, { timeout: 15_000 }, () => {
    const result = spawnSync("python3", [
      "-B", "scripts/tests/workspace_skill_sync_cases.py", name,
    ], { cwd: root, encoding: "utf8", timeout: 12_000, maxBuffer: 100_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, PYTHONDONTWRITEBYTECODE: "1" } });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${name}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^fixture-pass\n$/);
    assert.equal(result.stderr, "");
  });
}
