import fs from "node:fs";
import { readText, safePath, sha } from "./store.mjs";

export function executionSources(root) {
  const files = [
    ...fs.readdirSync(safePath(root, "scripts/failure-gate")).sort()
      .filter(file => /\.(mjs|py)$/.test(file)).map(file => "scripts/failure-gate/" + file),
    ".agents/skills/failure-gate-unified/SKILL.md",
    ".agents/skills/regression-guard/SKILL.md",
    "docs/validation/unified-tiers.json",
    "docs/validation/failure-baseline.json",
    "scripts/check-regression-guard.mjs",
    "scripts/validate-task-plans.mjs",
    "scripts/validation-tier.mjs",
    "scripts/new-plan.mjs",
    "scripts/run-validation.mjs",
    "scripts/check-failure-gate.mjs",
    "scripts/amend-plan.mjs",
    "scripts/tests/failure-gate.test.mjs",
    "scripts/tests/check-regression-guard.test.mjs",
    "scripts/port-authority-clock-proof.mjs",
    "scripts/fixtures/port-authority-clock-cases.mjs.txt",
    "scripts/configure-local-gate.mjs"
  ];
  return files.map(file => ({ file, hash: fs.existsSync(safePath(root, file)) ? sha(readText(root, file)) : null }));
}
