import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readText, safePath, sha } from "./store.mjs";

export function executionSources(root) {
  const files = [
    ...fs.readdirSync(safePath(root, "scripts/failure-gate")).sort()
      .filter(file => /\.(mjs|py)$/.test(file)).map(file => "scripts/failure-gate/" + file),
    ".agents/skills/failure-gate-unified/SKILL.md",
    ".agents/skills/regression-guard/SKILL.md",
    ".agents/skills/regression-guard/reference/enforcement-contract.md",
    ".agents/skills/regression-guard/reference/delivery-handoff.md",
    "docs/validation/unified-tiers.json",
    "docs/validation/unified-policy.json",
    "docs/validation/failure-baseline.json",
    "scripts/check-regression-guard.mjs",
    "scripts/validate-task-plans.mjs",
    "scripts/validation-tier.mjs",
    "scripts/new-plan.mjs",
    "scripts/complete-provisioning.mjs",
    "scripts/run-validation.mjs",
    "scripts/check-failure-gate.mjs",
    "scripts/check-regression-preflight.mjs",
    "scripts/check-unified-preflight.mjs",
    "scripts/prepare-plan.mjs",
    "scripts/dispatch-implementation.mjs",
    "scripts/amend-plan.mjs",
    "scripts/tests/failure-gate.test.mjs",
    "scripts/tests/check-regression-guard.test.mjs",
    "scripts/port-authority-clock-proof.mjs",
    "scripts/fixtures/port-authority-clock-cases.mjs.txt",
    "scripts/configure-local-gate.mjs"
  ];
  return files.map(file => ({ file, hash: fs.existsSync(safePath(root, file)) ? sha(readText(root, file)) : null }));
}

// Records the actual tracked implementation without secrets, ignored runtime
// files, ledger/run writes or generated outputs. Not a blanket evidence-expiry
// policy: the executor assesses which checks depend on a changed source.
export function implementationSources(root, workload) {
  const listed = spawnSync("git", ["-C", root, "ls-files", "-z", "--", "scripts", "artifacts", "lib", "package.json", "pnpm-lock.yaml"], {
    encoding: "utf8", timeout: 5000, maxBuffer: 4_000_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  if (listed.error || (listed.status !== 0 && !/not a git repository/.test(listed.stderr))) {
    throw new Error("Cannot observe tested implementation sources");
  }
  const direct = workload.steps.flatMap(s => s.argv.filter(a => !a.startsWith("-") && /\.[cm]?[jt]sx?$/.test(a))
    .map(a => path.posix.normalize(path.posix.join(s.cwd, a))));
  const files = [...new Set([...(listed.status === 0 ? listed.stdout.split("\0").filter(Boolean) : []), ...direct])].sort();
  return files.filter(file => /\.(?:[cm]?[jt]sx?|json|yaml|py)$/.test(file) && !/(?:^|\/)(?:node_modules|dist|generated-artifacts)\//.test(file))
    .map(file => ({ file, hash: fs.existsSync(safePath(root, file)) ? sha(readText(root, file)) : null }));
}
