import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { checkPlan } from "./plans.mjs";
import { policy, registry, tier, baseline, warnings, lease, transaction, atomicJson, readJson, readText, safePath, stamp, sha } from "./store.mjs";
import { executionSources, implementationSources } from "./execution-sources.mjs";
import { assertRegressionWorkload } from "./regression-contract.mjs";
import { checkVerificationDelivery } from "./verification.mjs";

export function parseFailures(step, text) {
  if (step.adapter !== "node-tap") return null;
  const total = [...text.matchAll(/^# fail (\d+)$/gm)].at(-1);
  if (!total) return null;
  const failures = [...text.matchAll(/^not ok \d+ - (.+)\n([\s\S]*?)(?=^(?:ok |not ok |# (?:Subtest|tests|suites))|(?![\s\S]))/gm)]
    .map(m => {
      const field = m[2].match(/^[ \t]*error:[ \t]*([^\r\n]+)$/m)?.[1];
      const signature = field === "|-" || field === "|" ?
        m[2].match(/^[ \t]*error:[ \t]*\|[-]?\r?\n((?:[ \t]{4,}[^\r\n]*\r?\n)+)/m)?.[1].trim() : field;
      return signature ? { suite: step.name, test: m[1], signature } : null;
    });
  if (failures.some(f => !f) || Number(total[1]) !== failures.length) return null;
  return failures;
}
export function evaluateFailures(catalog, spec, failures, notes = []) {
  if (!failures) return { acceptable: false, classifications: [], reason: "Unrecognized failure output; no baseline ignore applied" };
  const classifications = failures.map(f => {
    const matches = catalog.entries.filter(e => e.suite === f.suite && e.test === f.test && e.signature === f.signature &&
      e.status === "active" && (!e.expiresAt || Date.parse(e.expiresAt) >= Date.now()));
    const declaration = matches.length === 1 ? spec.baselines?.find(d => d.id === matches[0].id) : null;
    if (declaration?.kind === "owned") return { ...f, disposition: "owned", baselineId: matches[0].id };
    if (declaration?.kind === "ignored" && matches[0].disposition === "ignored") return { ...f, disposition: "ignored", baselineId: matches[0].id };
    const note = notes.find(n => n.suite === f.suite && n.test === f.test && n.signature === f.signature);
    return { ...f, disposition: note ? "self-classified-pre-existing" : "potential-regression", note: note ?? null };
  });
  return { acceptable: classifications.every(f => ["ignored", "self-classified-pre-existing"].includes(f.disposition)), classifications };
}
function safeEnv() {
  // No API credentials, session keys, DATABASE_URL, browser auth state or NODE_OPTIONS.
  const env = { PATH: process.env.PATH, LANG: "C.UTF-8", NODE_ENV: "test", CI: "true" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  return env;
}
export async function supervise(root, step, timeoutMs, cleanupMs, log) {
  return await new Promise(resolve => {
    const child = spawn("python3", [safePath(root, "scripts/failure-gate/supervisor.py"), String(timeoutMs), String(cleanupMs), safePath(root, log), JSON.stringify(step.argv)],
      { cwd: safePath(root, step.cwd), env: safeEnv(), detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", settled = false;
    const finish = result => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (result.blocked === "supervisor-unobservable") {
          child.unref();
          child.stdout.destroy();
          child.stderr.destroy();
        }
        resolve(result);
      }
    };
    // Independent supervisor has its own deadline. This watchdog never claims cleanup
    // when the supervisor becomes unavailable, and leaves the admission lock retained.
    const timer = setTimeout(() => finish({ exit: null, blocked: "supervisor-unobservable", quiescent: false }), timeoutMs + cleanupMs + 2000);
    child.stdout.on("data", data => { out = (out + data).slice(-16000); });
    child.stderr.on("data", data => { err = (err + data).slice(-16000); });
    child.on("error", () => finish({ exit: null, blocked: "supervisor-unavailable", quiescent: false }));
    child.on("close", code => {
      try {
        if (code !== 0) throw new Error("Supervisor failed");
        const result = JSON.parse(out.trim());
        if (typeof result.quiescent !== "boolean" || !Object.hasOwn(result, "exit")) throw new Error("Malformed result");
        finish(result);
      } catch { finish({ exit: null, blocked: "supervisor-failed", quiescent: false,
        diagnostic: err.slice(-4000) || "Supervisor returned an unobservable result" }); }
    });
  });
}
export async function run(root, id, selectedTier, planPath, retryRequest = null, regressionOptions = {}) {
  let admission = checkPlan(root, id, selectedTier, planPath, false, regressionOptions);
  checkVerificationDelivery(root, admission.record);
  if (admission.record.planTemplate === "unified-v4") assertRegressionWorkload(admission.record.spec, admission.t);
  const release = lease(root, "target-" + admission.t.target);
  let quiescent = true;
  const runId = crypto.randomUUID();
  const directory = ".local/failure-gate/runs/" + id + "/" + runId;
  const report = { schemaVersion: 1, id, runId, tier: selectedTier, contract: admission.record.contract, planHash: admission.record.planHash,
    tierHash: admission.t.hash, sources: executionSources(root), implementation: implementationSources(root, admission.t),
    startedAt: stamp(), state: "INCOMPLETE", required: 0, steps: [], retryOf: retryRequest, warnings: [] };
  const reportPath = directory + "/report.json";
  try {
    admission = checkPlan(root, id, selectedTier, planPath, false, regressionOptions);
    checkVerificationDelivery(root, admission.record);
    if (admission.record.planHash !== report.planHash || admission.t.hash !== report.tierHash) {
      throw new Error("Stale validation dispatch revision");
    }
    if (admission.record.planTemplate === "unified-v4") assertRegressionWorkload(admission.record.spec, admission.t);
    if (admission.record.activeRun) throw new Error("Owned run is active or uncertain; admission blocked");
    const catalog = baseline(root);
    report.warnings = warnings(catalog);
    const missing = admission.t.requires.filter(c => !admission.p.capabilities.includes(c));
    if (missing.length) {
      report.state = "BLOCKED";
      report.reason = "Unavailable checked capability route: " + missing.join(", ");
      atomicJson(root, reportPath, report);
      return report;
    }
    let steps = admission.t.steps;
    if (retryRequest) {
      const original = readJson(root, ".local/failure-gate/runs/" + id + "/" + retryRequest.runId + "/report.json");
      if (original.id !== id || original.runId !== retryRequest.runId || original.planHash !== report.planHash || original.tierHash !== report.tierHash) throw new Error("Retry provenance changed");
      const failed = original.steps[retryRequest.stepIndex];
      const failure = failed?.assessment?.classifications[retryRequest.failureIndex];
      const step = steps.find(s => s.name === failed?.name);
      if (!failure || !step?.retryPrefix || failed.exit === 0) throw new Error("No verified isolated retry route");
      // Test names are escaped literal regex arguments, never shell strings.
      const name = "^" + failure.test.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
      steps = [{ ...step, argv: [...step.retryPrefix, name, ...step.retrySuffix] }];
    }
    report.required = steps.length;
    atomicJson(root, reportPath, report);
    transaction(root, r => {
      if (r.records[id].status !== "provisioned" || r.records[id].planHash !== report.planHash ||
          r.records[id].tierHash !== report.tierHash) throw new Error("Stale validation dispatch context");
      if (r.records[id].activeRun) throw new Error("Owned run is active or uncertain");
      r.records[id].activeRun = { runId, target: admission.t.target, planHash: report.planHash, at: stamp() };
      r.records[id].runs.push({ runId, reportPath, kind: retryRequest ? "isolated-retry" : "tier-run", at: stamp() });
    });
    const deadline = performance.now() + admission.t.timeoutMs;
    for (const [index, step] of steps.entries()) {
      const remaining = Math.floor(deadline - performance.now() - admission.t.cleanupMs);
      if (remaining <= 0) { report.reason = "Cumulative deadline exhausted"; break; }
      const log = directory + "/step-" + index + ".log";
      const raw = await supervise(root, step, Math.min(remaining, admission.t.stepTimeoutMs), admission.t.cleanupMs, log);
      quiescent = raw.quiescent;
      const text = fs.existsSync(safePath(root, log)) ? readText(root, log) : "";
      const validNotes = admission.record.preexistingNotes.filter(n =>
        n.planHash === report.planHash && n.sources.every(s => sha(readText(root, s.file)) === s.hash));
      const assessment = raw.exit === 0 ? { acceptable: true, classifications: [] } :
        evaluateFailures(catalog, admission.record.spec, parseFailures(step, text), validNotes);
      if (raw.exit === 0 && step.adapter === "node-tap") {
        const tests = Number(text.match(/^# tests (\d+)$/m)?.[1] ?? 0);
        const passes = Number(text.match(/^# pass (\d+)$/m)?.[1] ?? 0);
        const skips = Number(text.match(/^# skipped (\d+)$/m)?.[1] ?? 0);
        if (!tests || (skips && !retryRequest) || (retryRequest && !passes)) {
          assessment.acceptable = false;
          raw.blocked = "required-tests-skipped-or-unobserved";
        }
      }
      report.steps.push({ name: step.name, argv: step.argv, log, logHash: sha(text), ...raw, assessment });
      atomicJson(root, reportPath, report);
      if (raw.blocked || !raw.quiescent || raw.exit === null) { report.state = raw.blocked === "supervisor-unavailable" ? "BLOCKED" : "INCOMPLETE"; break; }
      if (raw.exit !== 0 && !assessment.acceptable) { report.state = "FAIL"; break; }
      if (index === steps.length - 1) report.state = "PASS";
    }
    if (report.state === "PASS") {
      try { report.verification = checkVerificationDelivery(root, admission.record); }
      catch (error) { report.state = "INCOMPLETE"; report.reason = error.message; }
    }
    report.finishedAt = stamp();
    report.changedGateSources = executionSources(root).filter(source =>
      report.sources.some(old => old.file === source.file && old.hash !== source.hash));
    if (report.changedGateSources.length) {
      report.state = "INCOMPLETE";
      report.reason = "Gate/configuration sources changed during execution; renew affected evidence";
    }
    report.rawAllPassed = report.steps.length === report.required && report.steps.every(s => s.exit === 0 && !s.blocked && s.quiescent);
    report.isolatedRetryOnly = Boolean(retryRequest);
    atomicJson(root, reportPath, report);
    transaction(root, r => {
      if (quiescent) delete r.records[id].activeRun;
      r.records[id].events.push({ kind: retryRequest ? "isolated-retry-observed" : "validation-observed", runId, state: report.state, at: stamp() });
      if (!retryRequest) r.records[id].assessment = { state: report.state, runId, at: stamp() };
    });
    return report;
  } finally {
    if (quiescent) release(); // Uncertain owned work retains exclusion; never age-delete.
  }
}
export function selfClassify(root, id, runId, stepIndex, failureIndex, sources, options = {}) {
  const r = registry(root).records[id];
  if (!r) throw new Error("Unknown task");
  if (r.activeRun) throw new Error("Owned run is active or uncertain; classification blocked");
  checkPlan(root, id, r.tier, r.planPath, false, options);
  const original = readJson(root, `.local/failure-gate/runs/${id}/${runId}/report.json`);
  if (original.id !== id || original.planHash !== r.planHash || original.tierHash !== r.tierHash) throw new Error("Failure provenance changed");
  const failure = original.steps[stepIndex]?.assessment?.classifications[failureIndex];
  if (!failure || failure.disposition !== "potential-regression") throw new Error("No observed unlisted failure");
  if (baseline(root).entries.some(e => e.status === "active" && e.suite === failure.suite && e.test === failure.test && e.signature === failure.signature)) {
    throw new Error("Listed failure requires an explicit baseline ownership amendment, not self-classification");
  }
  const hasRetry = r.runs.some(entry => {
    const report = readJson(root, entry.reportPath);
    return report.retryOf?.runId === runId && report.retryOf.stepIndex === stepIndex &&
      report.retryOf.failureIndex === failureIndex && report.steps.length && report.steps.every(s => s.quiescent && !s.blocked);
  });
  if (!hasRetry) throw new Error("Observe an isolated retry first; its pass is not pre-existing provenance");
  if (!Array.isArray(sources) || !sources.length) throw new Error("Strong contextual evidence required");
  const checked = sources.map(s => {
    if (s.type !== "documented-pattern" || !s.file?.startsWith("docs/validation/") || typeof s.quote !== "string" || s.quote.length < 20) throw new Error("Supported documented-pattern source required, not retry evidence");
    const text = readText(root, s.file);
    if (!text.includes(s.quote)) throw new Error("Evidence quote not observed in source");
    return { ...s, hash: sha(text) };
  });
  const note = { suite: failure.suite, test: failure.test, signature: failure.signature,
    inference: true, sources: checked, planHash: r.planHash, observedRun: runId, at: stamp() };
  transaction(root, store => {
    store.records[id].preexistingNotes.push(note);
    store.records[id].events.push({ kind: "self-classified-pre-existing", note, at: stamp() });
  });
  return `[SELF-CLASSIFIED PRE-EXISTING] ${failure.suite} / ${failure.test} — evidence: documented pattern; inference recorded`;
}
export function closeOwnerDirection(root, id, directionResolver = null) {
  policy(root);
  const r = registry(root).records[id];
  if (!r || r.status !== "provisioned") throw new Error("Unknown/non-executable task");
  if (r.activeRun) throw new Error("Owned run is active or uncertain; closure blocked");
  // No flags/files supplied by a caller are accepted as proof of owner authority.
  if (!directionResolver) throw new Error("BLOCKED: authentic host owner-direction adapter unavailable");
  const direction = directionResolver(id);
  if (!direction || direction.verified !== true || direction.taskId !== id || !direction.reference || !direction.quote) throw new Error("Unverified owner direction");
  const release = lease(root, "target-" + tier(root, r.tier).target);
  try {
    transaction(root, store => {
      store.records[id].status = "owner-closed";
      store.records[id].completionMode = "owner_direction";
      store.records[id].administrativeClosure = { ...direction, at: stamp(), disclaimer: "Administrative closure, not a successful test run." };
      store.records[id].events.push({ kind: "owner-direction", reference: direction.reference, at: stamp() });
      // Never overwrite observed assessment with PASS.
    });
  } finally { release(); }
}
