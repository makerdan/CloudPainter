#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHECKER = path.join(PROJECT_ROOT, "scripts", "check-regression-guard.mjs");

for (const mode of ["--fix-stub", ""]) {
  const args = [CHECKER];
  if (mode) args.push(mode);
  const result = spawnSync(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: "inherit",
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
