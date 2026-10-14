import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const TIERS = ["test-fast", "test-standard", "test-standard-plus", "test-heavy"];
export const sha = value => crypto.createHash("sha256").update(value).digest("hex");
export const stamp = () => new Date().toISOString();
export const registryPath = "docs/validation/unified-task-registry.json";

export function safePath(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Expected a repository-relative path");
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error("Path escapes repository");
  let current = root;
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error("Symlink workspace denied");
  for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Symlink path denied");
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  return absolute;
}
export function readText(root, file) {
  const p = safePath(root, file);
  if (fs.statSync(p).size > 4_000_000) throw new Error("Control file exceeds bound");
  return fs.readFileSync(p, "utf8");
}
export const readJson = (root, file) => JSON.parse(readText(root, file));
export function atomicJson(root, file, value) {
  const target = safePath(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = target + "." + crypto.randomUUID() + ".tmp";
  const fd = fs.openSync(temp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temp, target);
  const dir = fs.openSync(path.dirname(target), "r");
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
export function lease(root, name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid lock name");
  const file = safePath(root, ".local/failure-gate/locks/" + name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.mkdirSync(file); } catch (e) {
    if (e.code === "EEXIST") throw new Error("Single-flight/transaction lock retained: " + name);
    throw e;
  }
  const token = crypto.randomUUID();
  fs.writeFileSync(path.join(file, "owner.json"), JSON.stringify({ token, pid: process.pid, at: stamp() }), { flag: "wx" });
  return () => {
    const owner = JSON.parse(fs.readFileSync(path.join(file, "owner.json"), "utf8"));
    if (owner.token !== token) throw new Error("Lock ownership changed; retained");
    fs.unlinkSync(path.join(file, "owner.json"));
    fs.rmdirSync(file);
  };
}
export function policy(root, execution = true) {
  const p = readJson(root, "docs/validation/unified-policy.json");
  if (p.schemaVersion !== 1 || !["staging", "active"].includes(p.mode) || !Array.isArray(p.capabilities) || !Array.isArray(p.legacyNativeTasks)) throw new Error("Unknown policy");
  if (p.canonicalSource !== ".agents/skills/failure-gate-unified/SKILL.md" || !/^[a-f0-9]{64}$/.test(p.canonicalSha256)) throw new Error("Canonical .agents target required");
  if (sha(readText(root, p.canonicalSource)) !== p.canonicalSha256) throw new Error("Canonical source drift");
  if (execution && p.mode !== "active") throw new Error("BLOCKED: staged policy; cutover is not authorized");
  if (execution && (!p.allocatorAuthorityVerified || p.authoritativeWorkspace !== root || process.env.REPL_ID !== p.projectId)) {
    throw new Error("BLOCKED: authoritative allocator route not verified");
  }
  return p;
}
export function registry(root) {
  const r = readJson(root, registryPath);
  const p = policy(root, false);
  if (r.schemaVersion !== 1 || r.projectId !== p.projectId || !Number.isSafeInteger(r.revision) || r.revision < 0 || !r.records || Array.isArray(r.records)) {
    throw new Error("Malformed identity registry");
  }
  for (const [id, record] of Object.entries(r.records)) {
    if (!/^FGU-[a-f0-9-]{36}$/.test(id) || id !== record.id || !TIERS.includes(record.tier) || !Array.isArray(record.events)) throw new Error("Malformed task binding");
  }
  return r;
}
export function transaction(root, callback) {
  const release = lease(root, "registry");
  let writing = false;
  try {
    const r = registry(root);
    const result = callback(r);
    r.revision++;
    writing = true;
    atomicJson(root, registryPath, r);
    writing = false;
    return result;
  } finally { if (!writing) release(); }
}
export function tier(root, name, seen = []) {
  if (!TIERS.includes(name) || seen.includes(name)) throw new Error("Unknown/cyclic tier");
  const all = readJson(root, "docs/validation/unified-tiers.json");
  if (all.schemaVersion !== 1 || Object.keys(all.tiers).sort().join() !== [...TIERS].sort().join()) throw new Error("Exactly four registered tiers required");
  const current = all.tiers[name];
  if (!current || !/^[a-z0-9-]+$/.test(current.target) || !Array.isArray(current.steps) || !Array.isArray(current.requires)) throw new Error("Malformed tier");
  for (const limit of ["timeoutMs", "stepTimeoutMs", "cleanupMs"]) {
    if (!Number.isSafeInteger(current[limit]) || current[limit] <= 0 || current[limit] > 2_700_000) throw new Error("Invalid finite tier budget");
  }
  const parent = current.extends ? tier(root, current.extends, [...seen, name]) : null;
  const steps = [...(parent?.steps ?? []), ...current.steps];
  if (!steps.length || new Set(steps.map(s => s.name)).size !== steps.length) throw new Error("Empty/duplicate command definition");
  for (const s of steps) {
    if (!/^[a-z0-9-]+$/.test(s.name) || !Array.isArray(s.argv) || !s.argv.length || s.argv.some(a => typeof a !== "string" || !a || a.includes("\0"))) throw new Error("Invalid code-owned command");
    if (!["node-tap", "exit"].includes(s.adapter)) throw new Error("Unknown failure adapter");
    safePath(root, s.cwd);
    if (s.retryPrefix && (!Array.isArray(s.retryPrefix) || !Array.isArray(s.retrySuffix))) throw new Error("Invalid isolated retry definition");
  }
  return { ...current, steps, requires: [...new Set([...(parent?.requires ?? []), ...current.requires])], hash: sha(JSON.stringify(all)) };
}
export function baseline(root) {
  const b = readJson(root, "docs/validation/failure-baseline.json");
  if (b.schemaVersion !== 1 || !Array.isArray(b.entries)) throw new Error("Malformed baseline catalog");
  const ids = new Set();
  for (const e of b.entries) {
    if (!/^[a-zA-Z0-9_-]+$/.test(e.id) || ids.has(e.id) || !["active", "stale", "retired"].includes(e.status) ||
        !["ignored", "owned"].includes(e.disposition) || ["suite", "test", "signature"].some(k => typeof e[k] !== "string" || !e[k].trim())) {
      throw new Error("Malformed/duplicate baseline record");
    }
    if (e.expiresAt && !Number.isFinite(Date.parse(e.expiresAt))) throw new Error("Invalid baseline expiry");
    ids.add(e.id);
  }
  return b;
}
export function warnings(catalog) {
  return catalog.entries.filter(e => e.status === "stale" || (e.expiresAt && Date.parse(e.expiresAt) < Date.now()))
    .map(e => "WARNING: stale/expired baseline " + e.id + "; review provenance separately");
}
