import { spawnSync } from "node:child_process";
import { openSync, closeSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [target, ...extra] = process.argv.slice(2);
if (extra.length || !["--libs", "artifacts/cloudpainter", "artifacts/api-server"].includes(target)) {
  console.error("Usage: node scripts/workspace-typecheck.mjs --libs|artifacts/cloudpainter|artifacts/api-server");
  process.exit(1);
}

// Root and focused preparation share one fail-fast lock. Never reclaim a lock
// just because it is old: a stopped process must be confirmed by the operator.
const lockPath = path.join(root, ".workspace-typecheck.lock");
let lock;
try {
  lock = openSync(lockPath, "wx");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.error(`Declaration preparation is already locked: ${lockPath}. Wait for the active check; if interrupted, confirm it and its children have stopped before removing the lock.`);
  process.exit(1);
}

function tsc(args) {
  const result = spawnSync(process.execPath, [
    path.join(root, "node_modules/typescript/bin/tsc"), ...args,
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`TypeScript interrupted by ${result.signal}`);
  return result.status;
}

try {
  writeFileSync(lock, `${JSON.stringify({ pid: process.pid, target })}\n`);
  // Preserve the canonical root solution and incremental library-first contract.
  // One build invocation orders referenced libraries; no force or codegen.
  const prepared = tsc(["--build"]);
  process.exitCode = prepared;
  if (prepared === 0 && target !== "--libs") {
    process.exitCode = tsc(["-p", path.join(target, "tsconfig.json"), "--noEmit"]);
  }
} finally {
  closeSync(lock);
  unlinkSync(lockPath);
}
