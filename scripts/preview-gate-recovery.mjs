import { ROOT } from "./failure-gate/cli.mjs";
import { recoveryPreview } from "./failure-gate/recovery.mjs";
try {
  if (process.argv.length !== 3) throw new Error("Supply one repository-relative candidate registry");
  console.log(JSON.stringify(recoveryPreview(ROOT, process.argv[2]), null, 2));
} catch (e) { console.error("BLOCKED: " + e.message); process.exitCode = 1; }
