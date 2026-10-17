import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { policy, registry, transaction, tier, baseline, readText, safePath, sha, stamp, lease } from "./store.mjs";
import { strictCheck } from "../check-regression-guard.mjs";

const filled = value => typeof value === "string" && value.trim() && !/[<>\r\n]|\b(?:TODO|TBD)\b/.test(value);
export function validateSpec(spec, template = "unified-v2") {
  for (const k of ["title", "why", "what"]) if (!filled(spec[k])) throw new Error("Fill " + k + " without placeholders/newlines");
  if (template !== "legacy-v1" && !filled(spec.coverageEvidence)) throw new Error("Fill coverageEvidence with tier workload reference and supported invocation");
  if (template === "unified-v3") {
    for (const key of ["done", "outOfScope", "steps", "relevantFiles"]) {
      if (!Array.isArray(spec[key]) || !spec[key].length || !spec[key].every(filled)) throw new Error("Fill " + key + " with concrete single-line entries");
    }
    const mode = spec.regression?.mode ?? "normal";
    const fields = { normal: ["covers", "testLocation", "checks"], na: ["why"], self: ["deliverable"], excluded: ["reason"] }[mode];
    if (!fields) throw new Error("Unknown regression declaration mode");
    const allowed = new Set(["mode", ...fields]);
    if (Object.keys(spec.regression).some(key => !allowed.has(key))) throw new Error("Mixed regression declaration fields");
    for (const key of fields) if (!filled(spec.regression[key])) throw new Error("Fill regression." + key);
  } else {
    for (const k of ["covers", "testLocation", "checks"]) if (!filled(spec.regression?.[k])) throw new Error("Fill regression." + k);
  }
  if (!Array.isArray(spec.baselines ?? [])) throw new Error("Invalid baseline declarations");
  if (spec.nativeTaskRef && !/^#\d+$/.test(spec.nativeTaskRef)) throw new Error("Invalid native linkage");
}
export function planTemplate(p, contract, representation = null) {
  const historical = p.planTemplates?.[contract];
  if (!["legacy-v1", "unified-v2"].includes(historical)) throw new Error("Unknown sealed contract template: default deny");
  const template = representation ?? historical;
  if (!["legacy-v1", "unified-v2", "unified-v3"].includes(template)) throw new Error("Unknown sealed plan representation");
  return template;
}
function newTemplate(p) {
  return planTemplate(p, p.canonicalSha256, p.newPlanTemplate ?? null);
}
function guardText(spec) {
  switch (spec.regression.mode ?? "normal") {
    case "normal": return `## Regression Guard\n**Covers:** ${spec.regression.covers}\n**Test location:** ${spec.regression.testLocation}\n**What it checks:** ${spec.regression.checks}\n`;
    case "na": return `## Regression Guard\n**N/A**\n**Why N/A:** ${spec.regression.why}\n`;
    case "self": return `## Regression Guard\n**Self-satisfying** — ${spec.regression.deliverable}\n`;
    case "excluded": return "";
    default: throw new Error("Unknown regression declaration mode");
  }
}
function strictPlan(text, file) {
  const violations = strictCheck([{ file, content: text }]);
  if (violations.length) throw new Error("Regression Guard strict check failed:\n" + violations.join("\n"));
}
function deferralEvidence(spec, projectId, resolveTask) {
  const location = spec.regression?.testLocation ?? "";
  if (!/\bdefer(?:red)?\b|\bfollow-up\b/i.test(location)) return null;
  const ref = location.match(/^Deferred to task #(\d+) \(accepted\) — .{20,}$/)?.[1];
  if (!ref || typeof resolveTask !== "function") {
    throw new Error("Deferral requires authoritative accepted host-task evidence; no host acceptance adapter is installed. Prose is not evidence.");
  }
  // The resolver is trusted host code, never a JSON field/CLI flag or receipt
  // authored by the planner. Acceptance is required at plan-write time.
  const evidence = resolveTask(ref);
  if (evidence?.verified !== true || evidence.projectId !== projectId ||
      evidence.taskRef !== ref || !["ACCEPTED", "READY", "IN_PROGRESS", "COMPLETED"].includes(evidence.state) ||
      !filled(evidence.reference)) throw new Error("Deferral target is not authoritatively accepted/non-draft in this project");
  return { taskRef: ref, projectId, state: evidence.state, reference: evidence.reference, observedAt: stamp() };
}
export function render(id, contract, spec, template = "unified-v2") {
  if (template === "unified-v3") {
    const historical = render(id, contract, { ...spec, regression: { covers: "", testLocation: "", checks: "" } }, "unified-v2");
    const list = items => items.map(item => "- " + item).join("\n");
    return historical.slice(0, historical.indexOf("## Pre-existing failures"))
      + `## Done looks like\n${list(spec.done)}\n\n## Out of scope\n${list(spec.outOfScope)}\n\n## Steps\n${spec.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\n`
      + historical.slice(historical.indexOf("## Pre-existing failures"), historical.indexOf("## Regression Guard"))
      + guardText(spec) + `\n## Relevant files\n${list(spec.relevantFiles)}\n`;
  }
  if (!["legacy-v1", "unified-v2"].includes(template)) throw new Error("Unknown plan template");
  const validation = template === "legacy-v1" ?
    "**Do not escalate:** This task ID is strictly bound to this tier. Other tiers will block execution." :
    `**Coverage evidence:** ${spec.coverageEvidence}\n**Do not switch tiers:** This task ID is strictly bound to this tier. Other tiers will block execution; changes require a supported amendment.`;
  const declarations = spec.baselines?.length ? spec.baselines.map(b =>
    `**${b.kind === "ignored" ? "Ignored baseline" : "Owned baseline repair"}:** ${b.id}`).join("\n") :
    "None known at plan time. Treat every failure as a potential regression.";
  return `# ${spec.title}\n\n**Unified task ID:** ${id}\n**Contract:** ${contract}\n\n## What & Why\n${spec.what}\n\n## Pre-existing failures to ignore\n${declarations}\n\n**Flaky-test rule:** A passing retry establishes intermittency, not pre-existing provenance.\n\n## Validation\n**Command:** \`${spec.tier}\`\n**Why:** ${spec.why}\n${validation}\n\n## Regression Guard\n**Covers:** ${spec.regression.covers}\n**Test location:** ${spec.regression.testLocation}\n**What it checks:** ${spec.regression.checks}\n`;
}
function declarations(root, spec) {
  const catalog = baseline(root);
  const used = new Set();
  for (const entry of spec.baselines ?? []) {
    if (!["ignored", "owned"].includes(entry.kind) || used.has(entry.id)) throw new Error("One ignored-or-owned declaration per baseline");
    const actual = catalog.entries.find(b => b.id === entry.id);
    if (!actual || actual.status === "retired") throw new Error("Baseline declaration has no retained catalog source");
    if (entry.kind === "ignored" && actual.disposition !== "ignored") throw new Error("Owned catalog repair cannot be relabelled ignored");
    used.add(entry.id);
  }
}
export function provision(root, spec, { resolveTask } = {}) {
  const p = policy(root);
  const template = newTemplate(p);
  validateSpec(spec, template);
  if (p.mode === "staging" && sha(JSON.stringify(spec)) !== p.bootstrap?.specHash) throw new Error("Only the approved migration may be provisioned while staging");
  if (p.legacyNativeTasks.some(t => t.ref === spec.nativeTaskRef)) throw new Error("Legacy native task cannot be retroactively bound");
  const t = tier(root, spec.tier);
  declarations(root, spec);
  const regressionDeferral = deferralEvidence(spec, p.projectId, resolveTask);
  const id = "FGU-" + crypto.randomUUID();
  const planPath = ".local/tasks/" + id + ".md";
  // Reservation commits first. Any subsequent failure retains this ID forever.
  transaction(root, r => {
    if (p.mode === "staging" && Object.values(r.records).some(record => record.bootstrapTask)) throw new Error("Migration identity already consumed; no replacement or reuse");
    if (r.records[id]) throw new Error("ID collision");
    r.records[id] = { id, status: "reserved", tier: spec.tier, tierHash: t.hash, contract: p.canonicalSha256,
      bootstrapTask: p.mode === "staging",
      planPath, spec, ...(template === "unified-v3" ? { planTemplate: template } : {}),
      ...(regressionDeferral ? { regressionDeferral } : {}),
      events: [{ kind: "reserved", at: stamp() }], runs: [], preexistingNotes: [] };
  });
  try {
    const text = render(id, p.canonicalSha256, spec, template);
    strictPlan(text, planPath);
    const file = safePath(root, planPath);
    fs.mkdirSync(safePath(root, ".local/tasks"), { recursive: true });
    const fd = fs.openSync(file, "wx", 0o600);
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    transaction(root, r => {
      r.records[id].status = "provisioned";
      r.records[id].planHash = sha(text);
      r.records[id].events.push({ kind: "provisioned", at: stamp() });
    });
    return id;
  } catch (e) {
    transaction(root, r => { r.records[id].status = "incomplete"; r.records[id].events.push({ kind: "generation-failed", at: stamp() }); });
    throw e;
  }
}
export function checkPlan(root, id, selectedTier, selectedPath, allowTierDrift = false) {
  return inspectPlan(root, id, selectedTier, selectedPath, allowTierDrift);
}
function inspectPlan(root, id, selectedTier, selectedPath, allowTierDrift = false, amendmentSource = false) {
  const p = policy(root);
  const record = registry(root).records[id];
  if (!record || record.status !== "provisioned") throw new Error("Unknown/non-executable task ID");
  if (typeof selectedPath !== "string" || !selectedPath) throw new Error("TASK_PLAN_FILE must name an existing .md bound plan");
  if (path.extname(selectedPath) !== ".md") throw new Error("TASK_PLAN_FILE must end in .md");
  const target = safePath(root, selectedPath);
  if (!fs.existsSync(target)) throw new Error("TASK_PLAN_FILE does not exist");
  if (!fs.statSync(target).isFile()) throw new Error("TASK_PLAN_FILE is not a file");
  if (p.mode === "staging" && (!record.bootstrapTask || sha(JSON.stringify(record.spec)) !== p.bootstrap?.specHash)) throw new Error("Only the approved migration may execute while staging");
  const template = planTemplate(p, record.contract, record.planTemplate);
  if (record.tier !== selectedTier || record.spec.tier !== record.tier) throw new Error("Wrong contract/tier: default deny");
  const t = tier(root, selectedTier);
  if (!allowTierDrift && record.tierHash !== t.hash) throw new Error("Tier definition changed; explicit amendment required");
  const expected = safePath(root, record.planPath);
  if (!selectedPath || expected !== safePath(root, selectedPath)) throw new Error("TASK_PLAN_FILE must identify the bound plan");
  const text = readText(root, record.planPath);
  if (sha(text) !== record.planHash || text !== render(id, record.contract, record.spec, template)) throw new Error("Plan changed; explicit amendment required");
  validateSpec(record.spec, template);
  declarations(root, record.spec);
  if (record.planTemplate === "unified-v3" && /\bdefer(?:red)?\b|\bfollow-up\b/i.test(record.spec.regression?.testLocation ?? "")) {
    const evidence = record.regressionDeferral;
    const ref = record.spec.regression.testLocation.match(/^Deferred to task #(\d+) \(accepted\) — .{20,}$/)?.[1];
    if (!evidence || evidence.taskRef !== ref || evidence.projectId !== p.projectId ||
        !["ACCEPTED", "READY", "IN_PROGRESS", "COMPLETED"].includes(evidence.state) ||
        !filled(evidence.reference) || !Number.isFinite(Date.parse(evidence.observedAt))) {
      if (!amendmentSource) throw new Error("Missing sealed authoritative deferral evidence");
    }
  }
  // Amendment can replace a sealed declaration rejected by the current linter;
  // all identity/hash/binding checks above still apply, and the replacement must pass.
  if (!amendmentSource) strictPlan(text, record.planPath);
  return { p, record, t };
}
export function amend(root, id, nextTier, why, replacementSpec = null, { resolveTask } = {}) {
  const p = policy(root);
  if (p.mode === "staging") throw new Error("Migration bootstrap contract is fixed; amendment requires an approved staging-policy change");
  if (!filled(why)) throw new Error("Document amendment rationale");
  const existing = registry(root).records[id];
  if (!existing || existing.status !== "provisioned") throw new Error("Unknown/non-executable ID");
  if (existing.activeRun) throw new Error("Owned run is active or uncertain; amendment blocked");
  const old = tier(root, existing.tier);
  const next = tier(root, nextTier);
  const releases = [];
  try {
    for (const name of [...new Set([old.target, next.target])].sort()) releases.push(lease(root, "target-" + name));
    inspectPlan(root, id, existing.tier, existing.planPath, true, true);
    const spec = { ...(replacementSpec ?? existing.spec), tier: nextTier, why };
    const template = newTemplate(p);
    validateSpec(spec, template);
    declarations(root, spec);
    const regressionDeferral = deferralEvidence(spec, p.projectId, resolveTask);
    if (p.legacyNativeTasks.some(t => t.ref === spec.nativeTaskRef)) throw new Error("Legacy native task cannot be retroactively bound");
    const text = render(id, p.canonicalSha256, spec, template);
    strictPlan(text, existing.planPath);
    // Commit invalidation before replacing plan. A crash can block, never silently run.
    transaction(root, r => {
      if (r.records[id].activeRun) throw new Error("Owned run is active or uncertain");
      r.records[id].status = "amending";
      r.records[id].events.push({ kind: "amendment-start", from: existing.tier, to: nextTier,
        fromDefinition: existing.tierHash, toDefinition: next.hash,
        fromContract: existing.contract, toContract: p.canonicalSha256,
        coverageEvidence: spec.coverageEvidence, why, at: stamp() });
    });
    const plan = safePath(root, existing.planPath);
    const temporary = plan + "." + crypto.randomUUID() + ".tmp";
    const fd = fs.openSync(temporary, "wx", 0o600);
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, plan);
    transaction(root, r => {
      Object.assign(r.records[id], { status: "provisioned", spec, contract: p.canonicalSha256, tier: nextTier, tierHash: next.hash, planHash: sha(text), preexistingNotes: [] });
      if (template === "unified-v3") r.records[id].planTemplate = template;
      else delete r.records[id].planTemplate;
      if (regressionDeferral) r.records[id].regressionDeferral = regressionDeferral;
      else delete r.records[id].regressionDeferral;
      r.records[id].events.push({ kind: "amended", from: existing.tier, to: nextTier,
        fromContract: existing.contract, toContract: p.canonicalSha256,
        coverageEvidence: spec.coverageEvidence, why, at: stamp() });
    });
  } finally { for (const release of releases.reverse()) release(); }
}
export function cancel(root, id, why) {
  policy(root);
  if (!filled(why)) throw new Error("Document cancellation");
  const existing = registry(root).records[id];
  if (!existing) throw new Error("Unknown task ID");
  if (existing.activeRun) throw new Error("Owned run is active or uncertain; cancellation blocked");
  const release = lease(root, "target-" + tier(root, existing.tier).target);
  try { transaction(root, r => {
    r.records[id].status = "cancelled";
    r.records[id].events.push({ kind: "cancelled", why, at: stamp() });
  }); } finally { release(); }
}
