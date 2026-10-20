import { readText, safePath } from "./store.mjs";
import fs from "node:fs";

// These are observed plan inputs, NOT an approval receipt. Host scope, approval
// and lifecycle remain the executing Agent's responsibility (see AGENTS.md).
export function checkContext(root, record, context) {
  const keys = ["id", "planHash", "tier", "contract", "nativeTaskRef", "nativeSealedText"];
  if (!context || typeof context !== "object" || Array.isArray(context) ||
      Object.keys(context).some(k => !keys.includes(k)) ||
      keys.some(k => typeof context[k] !== "string" || !context[k])) {
    throw new Error("Complete observed task context required; approval flags/receipts are not supported");
  }
  for (const key of ["id", "planHash", "tier", "contract"]) {
    if (context[key] !== record[key]) throw new Error("Stale/mismatched dispatch " + key);
  }
  if (!/^#\d+$/.test(record.spec.nativeTaskRef ?? "") ||
      context.nativeTaskRef !== record.spec.nativeTaskRef) throw new Error("Native task identity mismatch");
  if (context.nativeSealedText !== readText(root, record.planPath)) {
    throw new Error("Native/local sealed-plan mismatch; description edits alone are not admission");
  }
}

export function requiresContext(p, record) {
  return (p.preflightContracts ?? []).includes(record.contract);
}

export function assertQuiescent(root, record, target) {
  if (record.activeRun) throw new Error("Owned run is active or uncertain; wait for verified quiescence");
  if (fs.existsSync(safePath(root, ".local/failure-gate/locks/target-" + target))) {
    throw new Error("Affected target lease retained; wait for verified quiescence, never age-delete");
  }
}
