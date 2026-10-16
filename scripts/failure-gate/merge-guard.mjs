import { spawnSync } from "node:child_process";
import { isDeepStrictEqual as same } from "node:util";
import fs from "node:fs";

const prefix = (before, after) => Array.isArray(before) && Array.isArray(after) &&
  before.length <= after.length && before.every((item, i) => same(item, after[i]));
const reject = message => { throw new Error("Registry merge guard: " + message); };

// Cooperative repository enforcement, not authentication of a hostile writer.
// Compare the final worktree with HEAD as well as every transaction's input.
export function assertRegistryEvolution(before, after) {
  if (before.projectId !== after.projectId || before.schemaVersion !== after.schemaVersion ||
      !Number.isSafeInteger(after.revision) || after.revision < before.revision) reject("ledger identity/revision changed");
  if (!after.records || Array.isArray(after.records)) reject("malformed records");
  if (before.tombstones !== undefined) {
    if (Array.isArray(before.tombstones)) {
      if (!Array.isArray(after.tombstones) || before.tombstones.some(t => !after.tombstones.some(v => same(t, v)))) reject("dropped tombstone");
    } else {
      for (const [id, value] of Object.entries(before.tombstones)) {
        if (!same(value, after.tombstones?.[id])) reject("dropped or changed tombstone " + id);
      }
    }
  }
  for (const [id, old] of Object.entries(before.records)) {
    const next = after.records[id];
    if (!next) reject("dropped ID or tombstone " + id);
    if (same(old, next)) continue;
    if (!prefix(old.events, next.events) || !prefix(old.runs, next.runs)) reject("rewritten event/run history " + id);
    if (["cancelled", "owner-closed"].includes(old.status) && next.status !== old.status) reject("terminal identity reopened " + id);
    const events = next.events.slice(old.events.length);
    const allowed = new Set(["events"]);
    for (const event of events) {
      switch (event.kind) {
        case "amendment-start": allowed.add("status"); break;
        case "amended":
          for (const key of ["status", "spec", "tier", "tierHash", "contract", "planHash", "preexistingNotes"]) allowed.add(key);
          break;
        case "cancelled": allowed.add("status"); break;
        case "validation-observed":
        case "isolated-retry-observed":
          for (const key of ["activeRun", "assessment", "runs"]) allowed.add(key);
          break;
        case "self-classified-pre-existing": allowed.add("preexistingNotes"); break;
        case "owner-direction":
          for (const key of ["status", "completionMode", "administrativeClosure"]) allowed.add(key);
          break;
        // A reserved identity can only finish its own generation.
        case "provisioned":
        case "generation-failed":
          if (!["reserved", "incomplete"].includes(old.status)) reject("invalid generation transition " + id);
          allowed.add("status"); allowed.add("planHash"); break;
        default: reject("unsupported event " + event.kind);
      }
    }
    if (next.runs.length > old.runs.length) {
      allowed.add("runs"); allowed.add("activeRun");
      const latest = next.runs.at(-1);
      if (next.activeRun && next.activeRun.runId !== latest.runId) reject("run context mismatch " + id);
    }
    for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (!same(old[key], next[key]) && !allowed.has(key)) reject("unsupported record change " + id + "." + key);
    }
    const amendment = events.findLast(e => e.kind === "amended");
    if (amendment && (amendment.to !== next.tier || next.spec.tier !== next.tier ||
        amendment.toContract !== next.contract || !amendment.why || !amendment.coverageEvidence)) reject("incomplete amendment evidence " + id);
    const statusEvent = events.findLast(e => ["amendment-start", "amended", "cancelled", "owner-direction", "provisioned", "generation-failed"].includes(e.kind));
    const statuses = { "amendment-start": "amending", amended: "provisioned", cancelled: "cancelled",
      "owner-direction": "owner-closed", provisioned: "provisioned", "generation-failed": "incomplete" };
    if (statusEvent && next.status !== statuses[statusEvent.kind]) reject("unsupported status change " + id);
    if (!same(old.assessment, next.assessment)) {
      const observed = events.findLast(e => e.kind === "validation-observed");
      if (!observed || observed.runId !== next.assessment?.runId || observed.state !== next.assessment?.state ||
          !next.runs.some(r => r.runId === observed.runId)) reject("unsupported assessment change " + id);
    }
  }
}

export function assertCommittedRegistry(root, current) {
  const git = args => spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8", timeout: 5000, maxBuffer: 4_000_000,
    // No caller-controlled Git configuration or credential environment.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }
  });
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) {
    if (!top.error && /not a git repository/.test(top.stderr)) return "unversioned fixture; no committed comparison";
    reject("cannot inspect committed registry");
  }
  if (fs.realpathSync(top.stdout.trim()) !== fs.realpathSync(root)) reject("repository root mismatch");
  const file = "docs/validation/unified-task-registry.json";
  const committed = git(["show", "HEAD:" + file]);
  if (committed.status !== 0) {
    const tracked = git(["ls-files", "--error-unmatch", "--", file]);
    if (tracked.status === 1) return "registry not yet committed";
    reject("committed registry unavailable");
  }
  assertRegistryEvolution(JSON.parse(committed.stdout), current);
  return "committed registry preserved";
}
