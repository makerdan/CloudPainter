import fs from "node:fs";
import { atomicJson, readJson, readText, safePath, sha, lease, registry, stamp, tier } from "./store.mjs";

export const RECEIPT = ".local/failure-gate/workspace-authority.json";
export const SPEC = "docs/validation/unified-local-migration-spec.json";
export function executionSources(root) {
  const files = [
    ...fs.readdirSync(safePath(root, "scripts/failure-gate")).sort()
      .filter(file => /\.(mjs|py)$/.test(file)).map(file => "scripts/failure-gate/" + file),
    ".agents/skills/failure-gate-unified/SKILL.md",
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
    "scripts/configure-local-gate.mjs"
  ];
  return files.map(file => ({ file, hash: fs.existsSync(safePath(root, file)) ? sha(readText(root, file)) : null }));
}

// This is a cooperative local execution boundary, not user authentication or
// a hostile-code sandbox. A copied project/env identifier is not sufficient.
export function workspaceIdentity(root) {
  if (fs.realpathSync(root) !== root) throw new Error("Authority requires the real workspace path");
  const stat = fs.statSync(root, { bigint: true });
  return {
    root, device: String(stat.dev), inode: String(stat.ino),
    boot: sha(fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim())
  };
}
export function verifyLocalAuthority(root, p) {
  if (p.authority?.kind !== "local-workspace-v1") throw new Error("Verified local workspace authority required");
  const receipt = readJson(root, RECEIPT);
  if (sha(JSON.stringify(receipt)) !== p.authority.receiptHash ||
      JSON.stringify(receipt.identity) !== JSON.stringify(workspaceIdentity(root)) ||
      receipt.projectId !== p.projectId || p.authoritativeWorkspace !== root) {
    throw new Error("Copied, moved or stale workspace authority denied");
  }
}
export function enrollLocalMigration(root) {
  const release = lease(root, "registry");
  try {
    const p = readJson(root, "docs/validation/unified-policy.json");
    if (p.mode !== "staging" || p.cutover || p.authority) throw new Error("Enrollment only from un-enrolled staging");
    if (sha(readText(root, p.canonicalSource)) !== p.canonicalSha256) throw new Error("Canonical source drift");
    // Enrollment cannot silently take over an existing ledger/authority.
    if (Object.keys(registry(root).records).length) throw new Error("Existing identities require explicit reconciliation");
    const spec = readJson(root, SPEC);
    if (spec.tier !== "test-fast") throw new Error("Migration scope requires its approved test-fast contract");
    const receipt = { schemaVersion: 1, projectId: p.projectId, identity: workspaceIdentity(root), enrolledAt: stamp() };
    atomicJson(root, RECEIPT, receipt);
    p.authority = { kind: "local-workspace-v1", receiptHash: sha(JSON.stringify(receipt)) };
    p.bootstrap = { specHash: sha(JSON.stringify(spec)), specFile: SPEC };
    // Staging remains staging. This authorizes only one generated migration plan.
    atomicJson(root, "docs/validation/unified-policy.json", p);
    return "Local migration route enrolled; general task admission remains staged.";
  } finally { release(); }
}

export function activateLocal(root, id, acceptanceFile) {
  const release = lease(root, "registry");
  let releaseTarget;
  try {
    const p = readJson(root, "docs/validation/unified-policy.json");
    verifyLocalAuthority(root, p);
    if (p.mode !== "staging" || !p.bootstrap) throw new Error("Activation requires restricted staging");
    const r = registry(root);
    const record = r.records[id];
    if (!record?.bootstrapTask || record.status !== "provisioned" || record.assessment?.state !== "PASS") throw new Error("Migration bound-tier PASS required");
    if (Object.values(r.records).some(record => record.activeRun)) throw new Error("Active or uncertain run prevents activation");
    releaseTarget = lease(root, "target-" + tier(root, record.tier).target);
    const accepted = readJson(root, acceptanceFile);
    if (accepted.state !== "PASS" || accepted.independent !== true || !accepted.reviewer ||
        accepted.taskId !== id || accepted.runId !== record.assessment.runId ||
        !accepted.nativeTaskReconciliation || !Array.isArray(accepted.files) || !accepted.files.length) {
      throw new Error("Independent acceptance and current task reconciliation required");
    }
    for (const entry of accepted.files) {
      const actual = fs.existsSync(safePath(root, entry.file)) ? sha(readText(root, entry.file)) : null;
      if (actual !== entry.hash) throw new Error("Acceptance source drift: " + entry.file);
    }
    if (sha(readText(root, record.planPath)) !== record.planHash ||
        sha(JSON.stringify(record.spec)) !== p.bootstrap.specHash) throw new Error("Migration plan drift");
    const run = record.runs.find(run => run.runId === record.assessment.runId);
    const report = readJson(root, run.reportPath);
    if (report.id !== id || report.tier !== record.tier || report.state !== "PASS" || report.isolatedRetryOnly || report.planHash !== record.planHash ||
        report.tierHash !== tier(root, record.tier).hash || !report.finishedAt ||
        report.steps.length !== report.required || !report.steps.every(step => step.quiescent && !step.blocked && step.assessment.acceptable)) {
      throw new Error("Completed current bound-tier evidence required");
    }
    const sources = executionSources(root);
    if (JSON.stringify(sources) !== JSON.stringify(report.sources) ||
        sources.some(source => !accepted.files.some(file => file.file === source.file && file.hash === source.hash))) {
      throw new Error("Run/review source drift or incomplete acceptance coverage");
    }
    for (const step of report.steps) {
      if (sha(readText(root, step.log)) !== step.logHash) throw new Error("Run evidence drift");
    }
    p.mode = "active";
    p.cutover = { at: stamp(), migrationId: id, runId: report.runId,
      acceptanceFile, acceptanceHash: sha(readText(root, acceptanceFile)), boundary: "New local tasks only; isolated copies denied; CI independent" };
    atomicJson(root, "docs/validation/unified-policy.json", p);
    return p.cutover;
  } finally {
    releaseTarget?.();
    release();
  }
}
