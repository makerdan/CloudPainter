import { strictCheck, currentClassification } from "../check-regression-guard.mjs";
import { readText, sha } from "./store.mjs";
import path from "node:path";
import { validateVerification, assertNoChangeVerificationScope } from "./verification.mjs";

export const RG_REVISION = "6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1";
export const RG_REFERENCES = {
  "reference/enforcement-contract.md": "bdae119a887cda74dadbc6fded7ff7360e94c54fb57a858756ee4fdfa192d964",
  "reference/delivery-handoff.md": "2df6f93305e3757989bff36be1ab1bc7cc9deb3229ad703cec83e3ef1a4c9910",
};
export const CATEGORIES = [
  "bug-fix", "behavior-change", "error-handling", "security-privacy",
  "data-integrity", "concurrency-lifecycle", "performance-reliability", "compatibility-contract",
];
const concrete = value => typeof value === "string" && value.trim().length >= 25 &&
  !/<[^>]*>|\b(?:TODO|TBD|placeholder|tests? the fix|it works)\b/i.test(value);
const file = value => typeof value === "string" &&
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w@./-]+\.(?:[cm]?[jt]sx?|py|sh|rb|go|rs|java|cs)(?:\s|$)/.test(value);
const need = (condition, message) => { if (!condition) throw new Error("Regression Guard: " + message); };

// This is an adoption mapping, not a latest-rules fallback. An unknown mapping
// blocks only the record depending on it. Old seals need no metadata rewrite.
export function regressionRevision(root, p, contract, template) {
  const key = contract + "/" + template;
  const mapped = p.regressionGuard?.contracts?.[key];
  need(mapped === "legacy-v1" || mapped === RG_REVISION, "unknown adoption mapping for " + key);
  if (mapped === RG_REVISION) {
    need(p.regressionGuard.current === RG_REVISION, "unknown current adoption pin");
    need(template === "unified-v4", "current revision needs unified-v4 representation");
    for (const [relative, hash] of Object.entries({ "SKILL.md": RG_REVISION, ...RG_REFERENCES })) {
      need(sha(readText(root, ".agents/skills/regression-guard/" + relative)) === hash, "canonical source drift: " + relative);
    }
  } else need(template !== "unified-v4", "current representation cannot use historical rules");
  return mapped;
}

export function assessRegression(spec, text) {
  const a = spec.regressionAssessment;
  need(a && ["material", "excluded", "self"].includes(a.classification), "record a scope-based classification");
  for (const key of ["rationale", "scopeReview", "coverageReview"]) {
    need(concrete(a[key]), "concrete executor/planner assessment required: " + key);
  }
  need(Array.isArray(a.risks) && Array.isArray(a.coverage), "risks and coverage arrays required");
  const mode = spec.regression?.mode ?? "normal";
  const classification = currentClassification(text);
  if (a.verification !== undefined) {
    need(mode === "self" && a.classification === "self", "verification method contradicts declaration");
    validateVerification(a.verification);
    assertNoChangeVerificationScope(spec);
    need(!classification.qualifies, "verification scope includes material work: " + classification.reason);
  }
  const violations = strictCheck([{ file: "current candidate", content: text }], { current: true });
  need(!violations.length, violations.join("\n"));
  if (a.classification !== "material") {
    need(!classification.qualifies, "scope contradicts exclusion/self-satisfaction: " + classification.reason);
    need(!a.risks.length && !a.coverage.length, "material risks cannot be hidden by exclusion metadata");
    need(mode === (a.classification === "self" ? "self" : "excluded"), "classification/declaration mismatch");
    if (mode === "excluded") {
      need(["additive", "cosmetic", "internal", "deletion-marked", "test-only"].includes(a.exclusion), "unsupported exclusion");
      if (a.exclusion === "deletion-marked") {
        need(/\btask (?:is )?marked for deletion\b/i.test(a.rationale), "deletion means a non-executing task, not a DELETE title");
      }
    } else if (!a.verification) need(file(spec.regression.deliverable.replace(/^.*?((?:[\w@.-]+\/)+[\w.-]+\.(?:mjs|js|ts|tsx|py|sh)).*$/, "$1")),
      "self-satisfaction must name the actual check file");
    return;
  }
  need(["normal", "na"].includes(mode), "material work needs normal coverage or factual N/A");
  need(a.risks.length > 0, "enumerate every material component");
  const ids = new Set();
  for (const risk of a.risks) {
    need(typeof risk.id === "string" && /^[A-Za-z0-9_-]+$/.test(risk.id) && !ids.has(risk.id), "unique local risk labels required");
    ids.add(risk.id);
    need(CATEGORIES.includes(risk.category) && concrete(risk.change) && concrete(risk.layer), "risk needs category, actual change and affected layer");
  }
  if (mode === "na") {
    const e = a.exception;
    need(e && ["real-timing", "external", "visual", "removed"].includes(e.category), "permitted N/A category required");
    for (const key of ["facts", "alternatives", "residualRisk"]) need(concrete(e[key]), "factual N/A evidence required: " + key);
    need(Array.isArray(e.risks) && e.risks.length === ids.size && new Set(e.risks).size === ids.size &&
      e.risks.every(id => ids.has(id)), "N/A must account for every material risk");
    need(a.coverage.length === 0, "N/A cannot silently waive surviving normal coverage; split scope or cover it normally");
    const patterns = { "real-timing": /race|concurren/i, external: /external|third.party|unmockable/i,
      visual: /visual|pixel|screenshot/i, removed: /remov|delet|eliminat/i };
    need(patterns[e.category].test(spec.regression.why), "N/A category/declaration mismatch");
    return;
  }
  need(a.coverage.length === ids.size, "map each material risk to its detecting assertion");
  const covered = new Set();
  for (const c of a.coverage) {
    const risk = a.risks.find(r => r.id === c.risk);
    need(risk && !covered.has(c.risk), "missing/duplicate/unknown coverage risk");
    covered.add(c.risk);
    need(c.layer === risk.layer, "test layer does not match affected boundary");
    need(concrete(c.scenario) && concrete(c.assertion) && file(c.testLocation), "concrete scenario, future/existing test file and detecting assertion required");
    need(spec.regression.covers.includes(c.scenario) && spec.regression.testLocation.includes(c.testLocation) &&
      spec.regression.checks.includes(c.assertion), "risk map/declaration mismatch");
  }
}

// Only a trusted programmatic host resolver can supply this evidence. JSON
// receipts, state labels and CLI flags never install that resolver.
export function resolveDeferral(spec, projectId, resolveTask) {
  const d = spec.regression?.deferral;
  const mentions = /\bdefer(?:red)?\b|\bfollow-up\b/i.test(spec.regression?.testLocation ?? "");
  if (!d) {
    need(!mentions, "deferral needs structured stable host reference and fresh trusted resolver");
    return null;
  }
  need((spec.regression.mode ?? "normal") === "normal" && typeof resolveTask === "function",
    "deferral requires an authentic host resolver; CLI has none");
  for (const k of ["ref", "owner", "reason", "disposition"]) need(typeof d[k] === "string" && d[k].trim(), "deferral missing " + k);
  const e = resolveTask(d.ref);
  need(e && !e.then && e.verified === true && e.committed === true && e.eligible === true &&
    e.projectId === projectId && e.taskRef === d.ref && e.owner === d.owner &&
    typeof e.reference === "string" && e.reference.trim() &&
    typeof e.revision === "string" && e.revision.trim() &&
    concrete(e.commitment) && concrete(e.authorization) &&
    Array.isArray(e.recurrences) && spec.regressionAssessment.coverage.every(c => e.recurrences.includes(c.scenario)),
  "deferral target missing current commitment, ownership, scope or authorization");
  return { taskRef: e.taskRef, projectId, owner: e.owner, reference: e.reference, revision: e.revision,
    commitment: e.commitment, authorization: e.authorization, recurrences: e.recurrences };
}

export function assertRegressionWorkload(spec, tier) {
  if ((spec.regression?.mode ?? "normal") !== "normal" || spec.regression.deferral) return;
  for (const c of spec.regressionAssessment.coverage) {
    const location = c.testLocation.split(/\s/)[0];
    need(tier.steps.some(step => {
      if (step.argv[0] !== "node") return false; // Opaque package aliases need owning coverage integration.
      let tests = false;
      const executed = [];
      for (let i = 1; i < step.argv.length; i++) {
        const arg = step.argv[i];
        if (arg === "--test") { tests = true; continue; }
        if (["--import", "--require", "-r"].includes(arg)) { i++; continue; }
        if (/^--(?:test-(?:reporter|timeout)=|experimental-strip-types$)/.test(arg)) continue;
        if (arg.startsWith("-")) return false; // Unrecognized flags/values cannot prove coverage.
        if (!/\.[cm]?[jt]sx?$/.test(arg)) return false;
        executed.push(arg);
        if (!tests) break; // Anything after the script is an application argument.
      }
      return executed.some(arg => path.posix.normalize(path.posix.join(step.cwd, arg)) === location);
    }),
    "guard file is not in the bound workload: " + location + "; use a supported coverage/binding amendment, never switch tiers silently");
  }
}
