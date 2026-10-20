import { isDeepStrictEqual } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkPlan, validateSpec, render, planTemplate } from "./plans.mjs";
import { policy, registry, tier, baseline, TIERS, sha, readText, lease, safePath, atomicJson, stamp } from "./store.mjs";
import { checkContext, assertQuiescent } from "./context.mjs";
import { regressionRevision, assessRegression, assertRegressionWorkload, RG_REVISION } from "./regression-contract.mjs";
import { strictCheck } from "../check-regression-guard.mjs";
import { supervise } from "./runner.mjs";

// No writes, leases, stubs, provisioning or authorization assertions here.
export function preflight(root, id, selectedPath, context, options = {}) {
  return inspectPreflight(root, id, selectedPath, context, options);
}
function inspectPreflight(root, id, selectedPath, context, { resolveTask } = {}, targetHeld = false) {
  const record = registry(root).records[id];
  if (!record) throw new Error("Unknown task; restore exact sealed inputs, never allocate a replacement");
  checkContext(root, record, context);
  const admission = checkPlan(root, id, context.tier, selectedPath, false, { resolveTask, context });
  if (record.activeRun) throw new Error("Owned run is active or uncertain");
  if (!targetHeld) assertQuiescent(root, record, admission.t.target);
  if (record.planTemplate === "unified-v4") assertRegressionWorkload(record.spec, admission.t);
  const missing = admission.t.requires.filter(c => !admission.p.capabilities.includes(c));
  return {
    id, planHash: record.planHash, contract: record.contract, tier: record.tier,
    tierHash: record.tierHash, nativeTaskRef: record.spec.nativeTaskRef,
    assessment: "LOCAL_PLAN_VALID_HOST_CHECKS_REQUIRED",
    hostAuthorization: "NOT_OBSERVED", hostLifecycle: "NOT_OBSERVED",
    scopeAndTierAdequacy: "AGENT_INSPECTION_REQUIRED",
    executionAvailability: missing.length ? "BLOCKED" : "LOCAL_PREREQUISITES_AVAILABLE",
    missingCapabilities: missing,
  };
}

// Actual local dispatch boundary: pins inputs again under the target lease.
// Caller must first inspect current host approval/scope/lifecycle. No JSON
// boolean, cached preflight report or Start event can perform that host check.
// All affected work must finish before work resolves. No detached work allowed.
export async function dispatch(root, id, selectedPath, context, work, options = {}) {
  preflight(root, id, selectedPath, context, options);
  const record = registry(root).records[id];
  const release = lease(root, "target-" + tier(root, record.tier).target);
  let quiescent = true;
  try {
    const observed = inspectPreflight(root, id, selectedPath, context, options, true);
    if (observed.missingCapabilities.length) throw new Error("Unavailable checked capability route: " + observed.missingCapabilities.join(", "));
    if (typeof work !== "function") throw new Error("Supported dispatch requires an observed, awaited work callback");
    quiescent = false;
    const result = await work(observed);
    quiescent = result?.quiescent !== false;
    return result;
  } finally { if (quiescent) release(); }
}

// Bounded ordinary CLI boundary for local implementation scripts. It cannot
// grant host approval, invoke a tier, or intercept edits made outside this route.
export async function dispatchCommand(root, id, selectedPath, context, command) {
  if (!command || Object.keys(command).some(k => !["script", "args", "timeoutMs", "cleanupMs"].includes(k)) ||
      typeof command.script !== "string" || path.extname(command.script) !== ".mjs" ||
      !Array.isArray(command.args) || command.args.some(a => typeof a !== "string" || a.includes("\0")) ||
      !Number.isSafeInteger(command.timeoutMs) || command.timeoutMs <= 0 || command.timeoutMs > 180000 ||
      !Number.isSafeInteger(command.cleanupMs) || command.cleanupMs <= 0 || command.cleanupMs > 10000) {
    throw new Error("Dispatch needs an inspected local .mjs script, string args and finite <=180s/10s bounds");
  }
  const script = safePath(root, command.script);
  if (!fs.statSync(script).isFile()) throw new Error("Implementation script is not a file");
  return dispatch(root, id, selectedPath, context, async admitted => {
    const directory = ".local/failure-gate/implementation/" + id + "/" + crypto.randomUUID();
    fs.mkdirSync(safePath(root, directory), { recursive: true });
    const step = { cwd: ".", argv: [process.execPath, script, ...command.args] };
    const log = directory + "/raw.log";
    const record = { ...admitted, command: step.argv, scriptHash: sha(readText(root, command.script)),
      startedAt: stamp(), state: "INCOMPLETE", log };
    atomicJson(root, directory + "/report.json", record);
    const raw = await supervise(root, step, command.timeoutMs, command.cleanupMs, log);
    Object.assign(record, raw, { finishedAt: stamp(),
      state: raw.blocked || !raw.quiescent || raw.exit === null ? "INCOMPLETE" : raw.exit === 0 ? "PASS" : "FAIL",
      meaning: "Implementation command only; NOT validation-tier PASS or host authorization" });
    atomicJson(root, directory + "/report.json", record);
    return record;
  });
}

// Preparation is intentionally separate. The Agent supplies concrete inspected
// facts; this routine never invents scope, test assertions or owner approval.
// It selects the lightest workload containing ALL required code-owned steps.
export function prepare(root, draft, inspection, { id, context, resolveTask } = {}) {
  const p = policy(root);
  const catalog = baseline(root);
  if (!inspection || !Array.isArray(inspection.requiredSteps) || !inspection.requiredSteps.length ||
      inspection.requiredSteps.some(s => typeof s !== "string" || !s)) {
    throw new Error("Inspect actual coverage and supply required workload steps; names alone are not adequacy");
  }
  const adequate = TIERS.find(name => {
    const t = tier(root, name);
    return inspection.requiredSteps.every(step => t.steps.some(s => s.name === step));
  });
  if (!adequate) throw new Error("No registered adequate workload; do not lower coverage or invent a tier");
  const spec = { ...draft };
  for (const key of ["title", "what", "why", "coverageEvidence", "done", "outOfScope", "steps",
    "relevantFiles", "nativeTaskRef", "regression", "regressionAssessment", "baselines"]) {
    if (spec[key] === undefined && inspection[key] !== undefined) spec[key] = inspection[key];
  }
  spec.tier = adequate;
  // An empty catalog permits the canonical None-known rendering, not a
  // historical clean-baseline claim. Nonempty catalogs require inspected labels.
  if (spec.baselines === undefined && catalog.entries.length === 0) spec.baselines = [];
  if (!Array.isArray(spec.baselines)) throw new Error("Inspect applicable catalog entries and declare ignored/owned baselines");
  for (const entry of spec.baselines) {
    const actual = catalog.entries.find(b => b.id === entry.id);
    if (!actual || actual.status === "retired" || !["ignored", "owned"].includes(entry.kind) ||
        (entry.kind === "ignored" && actual.disposition !== "ignored")) throw new Error("Invalid inspected baseline declaration");
  }
  const template = planTemplate(p, p.canonicalSha256, p.newPlanTemplate);
  validateSpec(spec, template);
  if (!/^#\d+$/.test(spec.nativeTaskRef ?? "") || p.legacyNativeTasks.some(t => t.ref === spec.nativeTaskRef)) {
    throw new Error("Current native task linkage required; never retrofit historical native work");
  }
  const existing = id ? registry(root).records[id] : null;
  if (id) {
    if (!existing || existing.status !== "provisioned") throw new Error("Unknown/non-executable sealed task");
    checkContext(root, existing, context);
    assertQuiescent(root, existing, tier(root, existing.tier).target);
    if (spec.nativeTaskRef !== existing.spec.nativeTaskRef) throw new Error("Amendment cannot substitute native identity");
    if (isDeepStrictEqual(spec, existing.spec)) {
      preflight(root, id, existing.planPath, context, { resolveTask });
      return { operation: "reuse", id, planHash: existing.planHash, spec };
    }
  }
  // A preview is not an allocated identity and cannot be dispatched.
  const text = render(id ?? "UNALLOCATED-PREVIEW", p.canonicalSha256, spec, template);
  const revision = regressionRevision(root, p, p.canonicalSha256, template);
  if (revision === RG_REVISION) {
    assessRegression(spec, text);
    assertRegressionWorkload(spec, tier(root, adequate));
  } else {
    const errors = strictCheck([{ file: "candidate.md", content: text }]);
    if (errors.length) throw new Error(errors.join("\n"));
  }
  return { operation: existing ? "amendment-required" : "provision-required", id: id ?? null,
    fromPlanHash: existing?.planHash ?? null, candidateHash: sha(text), spec,
    hostAuthorization: "NOT_OBSERVED", preparationOnly: true };
}

// Exact bytes travel via the native task's sealed-plan payload or tracked
// delivery. This check never reconstructs/render-normalizes a received plan.
export function sealedInputs(root, id) {
  const record = registry(root).records[id];
  if (!record) throw new Error("Unknown task");
  const context = { id, planHash: record.planHash, tier: record.tier, contract: record.contract,
    nativeTaskRef: record.spec.nativeTaskRef, nativeSealedText: readText(root, record.planPath) };
  checkPlan(root, id, record.tier, record.planPath, false, { context });
  return context;
}
