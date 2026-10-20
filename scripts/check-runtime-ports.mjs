import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepository } from "./runtime-port-policy.mjs";

if (process.argv.length !== 2) {
  console.error("Usage: node scripts/check-runtime-ports.mjs (no paths or exemptions)");
  process.exitCode = 2;
} else {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const report = scanRepository(root);
    // Report only file/line/rule, never full source lines or URL credentials.
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.findings.length ? 1 : 0;
  } catch (error) {
    console.error("Runtime port scan failed: " + error.message);
    process.exitCode = 2;
  }
}
