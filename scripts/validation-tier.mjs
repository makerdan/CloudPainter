import { main } from "./failure-gate/cli.mjs";
const [tier, id, ...extra] = process.argv.slice(2);
if (!id || extra.length) {
  console.error("BLOCKED: supply exactly one provisioned Unified task ID.");
  process.exitCode = 1;
} else {
  await main("run", [id, tier]);
}
