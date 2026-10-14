import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrollLocalMigration, activateLocal } from "./failure-gate/local-authority.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const [action, id, acceptance, ...rest] = process.argv.slice(2);
  if (rest.length) throw new Error("Unexpected arguments");
  if (action === "enroll-migration" && !id && !acceptance) console.log(enrollLocalMigration(root));
  else if (action === "activate" && id && acceptance) console.log(JSON.stringify(activateLocal(root, id, acceptance)));
  else throw new Error("Usage: configure-local-gate.mjs enroll-migration | activate <migration-id> <acceptance.json>");
} catch (error) {
  console.error("BLOCKED: " + error.message);
  process.exitCode = 1;
}
