import { main } from "./failure-gate/cli.mjs";
const [tier, ...forwarded] = process.argv.slice(2);
const [id, ...extra] = forwarded[0] === "--" ? forwarded.slice(1) : forwarded;
if (!id || extra.length) {
  console.error("BLOCKED: supply exactly one provisioned Unified task ID.");
  process.exitCode = 1;
} else {
  await main("run", [id, tier]);
}
