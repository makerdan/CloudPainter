import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, registry, baseline, warnings, policy } from "./store.mjs";
import { provision, checkPlan, amend, cancel, regressionPreflight } from "./plans.mjs";
import { run, selfClassify, closeOwnerDirection } from "./runner.mjs";
import { validateSelectedPlan } from "../check-regression-guard.mjs";
import { preflight, prepare, dispatchCommand } from "./preflight.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export async function main(action, args = process.argv.slice(2)) {
  try {
    const [id, second, third, fourth, fifth] = args;
    const observedContext = () => process.env.UNIFIED_CONTEXT_FILE ? readJson(ROOT, process.env.UNIFIED_CONTEXT_FILE) : undefined;
    switch (action) {
      case "new":
        if (args.length !== 1) throw new Error("Usage: new-plan.mjs <repository-relative-spec.json>");
        console.log(provision(ROOT, readJson(ROOT, id))); break;
      case "check": {
        if (args.length > 1) throw new Error("Usage: check-failure-gate.mjs [task-id]");
        if (Object.hasOwn(process.env, "TASK_PLAN_FILE")) {
          validateSelectedPlan();
          if (!id) throw new Error("TASK_PLAN_FILE requires the bound task ID; cannot use summary mode");
        }
        if (!id) {
          const p = policy(ROOT, false);
          console.log(JSON.stringify({ mode: p.mode, assessment: "NOT_EXECUTION", registryRecords: Object.keys(registry(ROOT).records).length, warnings: warnings(baseline(ROOT)) }));
        } else {
          const record = registry(ROOT).records[id];
          checkPlan(ROOT, id, record?.tier, process.env.TASK_PLAN_FILE, false, { context: observedContext() });
          console.log("Bound plan verified; no tests launched.");
        }
        break;
      }
      case "amend":
        if (![3, 4, 5].includes(args.length)) throw new Error("Usage: amend-plan.mjs <id> <tier> <rationale> [replacement-spec.json] [coordination.json]");
        const amendment = amend(ROOT, id, second, third, fourth ? readJson(ROOT, fourth) : null,
          { context: observedContext(), coordination: fifth ? readJson(ROOT, fifth) : undefined });
        console.log(amendment?.operation === "reuse" ? "Unchanged valid plan reused; no amendment." :
          "Amendment recorded; reconcile native sealed payload and rerun preflight. Host authorization is Agent-checked."); break;
      case "preflight":
        if (args.length !== 1) throw new Error("Usage: check-unified-preflight.mjs <id> with TASK_PLAN_FILE and UNIFIED_CONTEXT_FILE");
        validateSelectedPlan();
        console.log(JSON.stringify(preflight(ROOT, id, process.env.TASK_PLAN_FILE, observedContext())));
        break;
      case "prepare": {
        if (args.length !== 1) throw new Error("Usage: prepare-plan.mjs <candidate-and-inspection.json>");
        const input = readJson(ROOT, id);
        console.log(JSON.stringify(prepare(ROOT, input.draft, input.inspection,
          { id: input.id, context: observedContext() })));
        break;
      }
      case "dispatch": {
        if (args.length !== 2) throw new Error("Usage: dispatch-implementation.mjs <id> <bounded-local-command.json>");
        const report = await dispatchCommand(ROOT, id, process.env.TASK_PLAN_FILE, observedContext(), readJson(ROOT, second));
        console.log(JSON.stringify(report));
        process.exitCode = report.state === "PASS" ? 0 : 1;
        break;
      }
      case "regression-preflight":
        if (args.length !== 2 || !/^[a-f0-9]{64}$/.test(second)) throw new Error("Usage: check-regression-preflight.mjs <id> <observed-plan-sha256>");
        validateSelectedPlan();
        console.log(JSON.stringify(regressionPreflight(ROOT, id, process.env.TASK_PLAN_FILE, second, { context: observedContext() })));
        break;
      case "cancel":
        if (args.length !== 2) throw new Error("Usage: cancel-plan.mjs <id> <rationale>");
        cancel(ROOT, id, second); console.log("Permanent tombstone retained."); break;
      case "baseline":
        if (args.length) throw new Error("Baseline maintenance is read-only warning output.");
        for (const warning of warnings(baseline(ROOT))) console.log(warning);
        console.log("Baseline catalog preserved; no maintenance blocker."); break;
      case "run":
      case "retry": {
        if (args.length !== (action === "run" ? 2 : 5)) throw new Error("Usage: run-validation.mjs <id> <tier>; retry-validation.mjs <id> <tier> <run-id> <step-index> <failure-index>");
        const retry = action === "retry" ? { runId: third, stepIndex: Number(fourth), failureIndex: Number(fifth) } : null;
        if (retry && (!/^[a-f0-9-]{36}$/.test(third) || !Number.isInteger(retry.stepIndex) || !Number.isInteger(retry.failureIndex))) throw new Error("Invalid retry provenance");
        const report = await run(ROOT, id, second, process.env.TASK_PLAN_FILE, retry, { context: observedContext() });
        console.log(JSON.stringify(report));
        process.exitCode = report.state === "PASS" ? 0 : 1;
        break;
      }
      case "classify":
        if (args.length !== 5 || !/^[a-f0-9-]{36}$/.test(second)) throw new Error("Usage: classify-failure.mjs <id> <run-id> <step-index> <failure-index> <sources.json>");
        console.log(selfClassify(ROOT, id, second, Number(third), Number(fourth), readJson(ROOT, fifth), { context: observedContext() })); break;
      case "close":
        if (args.length !== 1) throw new Error("Usage: close-validation.mjs <id>");
        closeOwnerDirection(ROOT, id); break;
      default: throw new Error("Unknown gate operation");
    }
  } catch (e) {
    console.error("BLOCKED: " + e.message);
    process.exitCode = 1;
  }
}
