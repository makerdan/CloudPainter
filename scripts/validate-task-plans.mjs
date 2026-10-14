#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { policy } from "./failure-gate/store.mjs";

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHECKER = path.join(PROJECT_ROOT, "scripts", "check-regression-guard.mjs");

const unifiedId = process.env.UNIFIED_TASK_ID;
const selected = process.env.TASK_PLAN_FILE;
const unifiedContext = Boolean(unifiedId) || /(?:^|[/\\])FGU-[a-f0-9-]+\.md$/.test(selected ?? "");
const gateActive = policy(PROJECT_ROOT, false).mode === "active";
if (gateActive || unifiedContext) {
  if (!unifiedId || !selected) {
    console.error("BLOCKED: Unified validation requires UNIFIED_TASK_ID and TASK_PLAN_FILE.");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [path.join(PROJECT_ROOT, "scripts/check-failure-gate.mjs"), unifiedId], {
    cwd: PROJECT_ROOT, env: process.env, stdio: "inherit", timeout: 10000,
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

// Legacy/native behavior is unchanged while staging. Sealed Unified plans are
// strict and scoped; never insert stubs or mutate the environment-local archive.
for (const mode of gateActive || unifiedContext ? [""] : ["--fix-stub", ""]) {
  const args = [CHECKER];
  if (mode) args.push(mode);
  const result = spawnSync(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: "inherit",
    timeout: 10000,
  });
  if (result.error) {
    console.error(`Task-plan validation could not start: ${result.error.message}`);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
