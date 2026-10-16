import fs from "node:fs";
import crypto from "node:crypto";
import { policy, registry, transaction, tier, baseline, readText, safePath, sha, stamp, lease } from "./store.mjs";

const filled = value => typeof value === "string" && value.trim() && !/[<>\r\n]|\b(?:TODO|TBD)\b/.test(value);
export function validateSpec(spec, template = "unified-v2") {
  for (const k of ["title", "why", "what"]) if (!filled(spec[k])) throw new Error("Fill " + k + " without placeholders/newlines");
  if (template === "unified-v2" && !filled(spec.coverageEvidence)) throw new Error("Fill coverageEvidence with tier workload reference and supported invocation");
  for (const k of ["covers", "testLocation", "checks"]) if (!filled(spec.regression?.[k])) throw new Error("Fill regression." + k);
  if (!Array.isArray(spec.baselines ?? [])) throw new Error("Invalid baseline declarations");
  if (spec.nativeTaskRef && !/^#\d+$/.test(spec.nativeTaskRef)) throw new Error("Invalid native linkage");
}
export function planTemplate(p, contract) {
  const template = p.planTemplates?.[contract];
  if (!["legacy-v1", "unified-v2"].includes(template)) throw new Error("Unknown sealed contract template: default deny");
  return template;
}
export function render(id, contract, spec, template = "unified-v2") {
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
export function provision(root, spec) {
  const p = policy(root);
  const template = planTemplate(p, p.canonicalSha256);
  validateSpec(spec, template);
  if (p.mode === "staging" && sha(JSON.stringify(spec)) !== p.bootstrap?.specHash) throw new Error("Only the approved migration may be provisioned while staging");
  if (p.legacyNativeTasks.some(t => t.ref === spec.nativeTaskRef)) throw new Error("Legacy native task cannot be retroactively bound");
  const t = tier(root, spec.tier);
  declarations(root, spec);
  const id = "FGU-" + crypto.randomUUID();
  const planPath = ".local/tasks/" + id + ".md";
  // Reservation commits first. Any subsequent failure retains this ID forever.
  transaction(root, r => {
    if (p.mode === "staging" && Object.values(r.records).some(record => record.bootstrapTask)) throw new Error("Migration identity already consumed; no replacement or reuse");
    if (r.records[id]) throw new Error("ID collision");
    r.records[id] = { id, status: "reserved", tier: spec.tier, tierHash: t.hash, contract: p.canonicalSha256,
      bootstrapTask: p.mode === "staging",
      planPath, spec, events: [{ kind: "reserved", at: stamp() }], runs: [], preexistingNotes: [] };
  });
  try {
    const text = render(id, p.canonicalSha256, spec, template);
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
  const p = policy(root);
  const record = registry(root).records[id];
  if (!record || record.status !== "provisioned") throw new Error("Unknown/non-executable task ID");
  if (p.mode === "staging" && (!record.bootstrapTask || sha(JSON.stringify(record.spec)) !== p.bootstrap?.specHash)) throw new Error("Only the approved migration may execute while staging");
  const template = planTemplate(p, record.contract);
  if (record.tier !== selectedTier || record.spec.tier !== record.tier) throw new Error("Wrong contract/tier: default deny");
  const t = tier(root, selectedTier);
  if (!allowTierDrift && record.tierHash !== t.hash) throw new Error("Tier definition changed; explicit amendment required");
  const expected = safePath(root, record.planPath);
  if (!selectedPath || expected !== safePath(root, selectedPath)) throw new Error("TASK_PLAN_FILE must identify the bound plan");
  const text = readText(root, record.planPath);
  if (sha(text) !== record.planHash || text !== render(id, record.contract, record.spec, template)) throw new Error("Plan changed; explicit amendment required");
  validateSpec(record.spec, template);
  declarations(root, record.spec);
  return { p, record, t };
}
export function amend(root, id, nextTier, why, replacementSpec = null) {
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
    checkPlan(root, id, existing.tier, existing.planPath, true);
    const spec = { ...(replacementSpec ?? existing.spec), tier: nextTier, why };
    const template = planTemplate(p, p.canonicalSha256);
    validateSpec(spec, template);
    declarations(root, spec);
    if (p.legacyNativeTasks.some(t => t.ref === spec.nativeTaskRef)) throw new Error("Legacy native task cannot be retroactively bound");
    const text = render(id, p.canonicalSha256, spec, template);
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
