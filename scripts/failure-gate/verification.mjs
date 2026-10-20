import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { safePath, readJson, sha } from "./store.mjs";

const need = (ok, message) => { if (!ok) throw new Error("Verification: " + message); };
const hash = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const prose = s => typeof s === "string" && s.trim().length >= 25 &&
  !/\b(?:TODO|TBD|placeholder|it works|verified successfully)\b|<[^>]*>/i.test(s);
const relative = s => typeof s === "string" && s.length > 0 && s.length < 500 &&
  !s.startsWith("/") && !s.includes("\\") && !s.includes("\0") &&
  s.split("/").every(p => p && p !== "." && p !== "..");
const keys = (o, required, optional = []) => o && typeof o === "object" && !Array.isArray(o) &&
  required.every(k => Object.hasOwn(o, k)) && Object.keys(o).every(k => [...required, ...optional].includes(k));

// Planned method, not results. This is sealed in the existing regression
// assessment; no new approval registry, tier or historical representation.
export function validateVerification(v) {
  need(keys(v, ["target", "source", "method", "assertions", "observationsLocation", "repairPolicy"]), "complete structured method required");
  need(keys(v.target, ["path", "sha256"]) && relative(v.target.path) && hash(v.target.sha256), "exact target path and SHA-256 required");
  need(keys(v.source, ["path", "sha256"], ["member", "memberSha256"]) &&
    relative(v.source.path) && hash(v.source.sha256), "approved comparison source and SHA-256 required");
  need(v.source.path !== v.target.path, "comparison source must be independent of target");
  if (v.source.member !== undefined || v.source.memberSha256 !== undefined) {
    need(relative(v.source.member) && !/[*?[\]\r\n]|^-/.test(v.source.member) &&
      hash(v.source.memberSha256) && /\.zip$/i.test(v.source.path), "ZIP member and its SHA-256 required together");
  }
  need(prose(v.method), "concrete reproducible inspection method required");
  need(relative(v.observationsLocation) && v.observationsLocation !== v.target.path &&
    v.observationsLocation !== v.source.path, "separate observation record required");
  need(v.repairPolicy === "stop-and-amend-before-correction", "no-change verification cannot authorize conditional repair");
  need(Array.isArray(v.assertions) && v.assertions.length > 0 && v.assertions.length <= 100, "specific assertions required");
  const ids = new Set();
  for (const a of v.assertions) {
    need(keys(a, ["id", "kind", "assertion", "expected"]) &&
      /^[a-z][a-z0-9-]{0,60}$/.test(a.id) && !ids.has(a.id), "unique assertion IDs and fields required");
    ids.add(a.id);
    need(prose(a.assertion), "concrete assertion required");
    need(a.kind === "bytes-equal" ? a.expected === "equal" :
      a.kind === "contains" ? typeof a.expected === "string" && a.expected.trim().length >= 15 : false,
    "explicit byte equality or concrete content expectation required");
  }
  need(v.assertions.some(a => a.kind === "bytes-equal"), "source-to-target byte comparison required");
}

export function assertNoChangeVerificationScope(spec) {
  // Inspect active requested scope, not the assessment's self-description.
  // Negated no-change boundaries are not permission to hide a second directive.
  const lines = [spec.title, spec.what, spec.why, ...spec.done, ...spec.steps,
    spec.regressionAssessment.verification.method];
  const mutation = /\b(?:add|write|edit|patch|replace|remove|delete|alter|modify|repair|fix|implement|activate|deploy|waive|disable|enable|allow|permit|bypass|rebind|change|update|rewrite|grant)(?:s|d|ed|ing)?\b/i;
  for (const line of lines) {
    for (let clause of line.split(/[;\n]|\.(?:\s|$)|\b(?:but|then|also)\b/i)) {
      clause = clause.replace(/does not grant implicit workload, listener-takeover, live-restart or deployment permission/gi, "")
        .replace(/\b(?:no|without) (?:separate )?material (?:executable |behavior )?changes?\b/gi, "")
        .replace(/\bunchanged (?:behavior|source|definition|scope)\b/gi, "");
      need(!mutation.test(clause), "active scope is not no-change verification; use supported amendment and reassess correction substance");
    }
  }
}

function bytes(root, relativePath) {
  const file = safePath(root, relativePath);
  const stat = fs.statSync(file);
  need(stat.isFile() && stat.size <= 4_000_000, "snapshot must be a bounded regular file");
  return fs.readFileSync(file);
}

export function verificationSnapshot(root, v) {
  validateVerification(v);
  const target = bytes(root, v.target.path), archive = bytes(root, v.source.path);
  need(sha(target) === v.target.sha256 && sha(archive) === v.source.sha256, "target/source snapshot changed; reassess and amend before correction");
  let source = archive;
  if (v.source.member) {
    // Fixed executable, no shell, no extraction or member-controlled switches.
    const result = spawnSync("unzip", ["-p", safePath(root, v.source.path), v.source.member], {
      timeout: 5000, maxBuffer: 4_000_000, env: { PATH: process.env.PATH },
    });
    need(!result.error && result.status === 0, "bounded approved ZIP-member read failed");
    source = result.stdout;
    need(sha(source) === v.source.memberSha256, "approved member snapshot changed");
  }
  const outcomes = v.assertions.map(a => ({
    id: a.id,
    matched: a.kind === "bytes-equal" ? target.equals(source) : target.toString("utf8").includes(a.expected),
  }));
  return { targetSha256: sha(target), sourceSha256: sha(archive), comparisonSha256: sha(source),
    targetBytes: target.length, outcomes };
}

// Delivery, unlike plan admission, requires actual observations and current
// snapshot assertions. The executor still owns semantic inspection and honest
// reporting; this does not authenticate host approval or arbitrary prose.
export function checkVerificationDelivery(root, record) {
  const v = record.spec.regressionAssessment?.verification;
  if (!v) return null;
  validateVerification(v);
  const report = readJson(root, v.observationsLocation);
  need(keys(report, ["id", "planHash", "verificationHash", "snapshot", "observations", "limitations", "observedAt"]),
    "complete delivery observation record required");
  need(report.id === record.id && report.planHash === record.planHash && report.verificationHash === sha(JSON.stringify(v)),
    "observations must identify this sealed method and revision");
  need(typeof report.observedAt === "string" && Number.isFinite(Date.parse(report.observedAt)), "observation time required");
  const snapshot = verificationSnapshot(root, v);
  need(JSON.stringify(report.snapshot) === JSON.stringify(snapshot), "observations do not match inspected snapshot");
  need(snapshot.outcomes.every(o => o.matched), "required comparison/content assertion failed");
  need(Array.isArray(report.observations) && report.observations.length === v.assertions.length &&
    new Set(report.observations.map(o => o.id)).size === v.assertions.length &&
    v.assertions.every(a => report.observations.some(o => o.id === a.id && prose(o.actual) &&
      o.actual.includes(a.kind === "bytes-equal" ? snapshot.targetSha256 : a.expected))),
  "actual observations for every assertion required, not generic verified prose");
  need(Array.isArray(report.limitations) && report.limitations.length > 0 && report.limitations.every(prose),
    "explicit inspection limitations required");
  return { verificationHash: report.verificationHash, reportHash: sha(JSON.stringify(report)), snapshot };
}
