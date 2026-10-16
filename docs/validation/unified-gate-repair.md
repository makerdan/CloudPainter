# Owner-directed Unified gate repair

**State: PASS — bounded gate maintenance, not a validation-tier PASS.**

## Authorization and inspected state

- Owner instruction:
  `attached_assets/Pasted-Owner-direction-perform-gate-work-under-the-attached-Fa_1792180026127.txt`,
  received in the active conversation. It expressly authorizes this gate repair
  without a new task, separate specification, reviewer or bootstrap.
- Inspected main-workspace source: branch `main`, pre-change HEAD
  `39eba29`. Verification date: **2026-10-16 UTC**.
- Before editing, direct comparison of the retained location receipt showed
  root and inode matched; device and boot did not. The current root inode was
  256. `policy(ROOT, true)` rejected with
  `Copied, moved or stale workspace authority denied`.
  This verifies the immediate failure, not a universal claim about host inodes.
- `plans.mjs` rendered the old validation wording, omitted coverage evidence,
  and compared every recorded contract with the current canonical pin.

## Canonical revision

Installed `.agents/skills/failure-gate-unified/SKILL.md` exactly from the
single-file archive
`attached_assets/failure-gate-unified-2026-10-15_1792180022158.zip`.

- Archive SHA-256:
  `36af4dd4fbfd792159e8804c60c1519e3cc9f3224d056a193b226116a58adf11`.
- Previous pin:
  `d4eeb2a528f5e77af89bdd1b5c23f24cc3af58a2a3bb46d30046dd2ddbfdbab0`.
- Installed source and current policy pin:
  `73254fc29ec62a3966fd16508ec20dcac6cc676f65fa309a5365d400dcccf2cc`.

Archive-to-installed byte equality and matching policy pin were verified.
Revision 2 is also recorded in `unified-policy.json` and
`unified-contract-revision.md`. Runtime skill mirrors and older definitions
were not merged into the canonical source.

## Changes

| Location | Change and enforcement retained |
| --- | --- |
| `AGENTS.md`, `replit.md`, `docs/validation/unified-local-execution.md` | Owner-directed gate maintenance now follows the canonical maintenance section. Admission is portable across restarts and task environments through provisioning, sealed plans and the tier-bound runner. |
| `scripts/failure-gate/local-authority.mjs` | Removed machine identity, enrollment and historical activation implementation. It was an unnecessary execution restriction, not application authentication. |
| `scripts/failure-gate/execution-sources.mjs`, `runner.mjs` | Retained source-fingerprint evidence in its own module. New run reports identify the task's sealed contract. |
| `scripts/failure-gate/store.mjs`, `unified-policy.json` | Removed the location check and its two policy fields. Canonical-pin, schema, mode, safe-path, registry, tier, capability and baseline checks remain. |
| `.local/failure-gate/workspace-authority.json` | Removed the obsolete ignored local receipt as expressly authorized. No ledger or credentials were deleted. |
| `scripts/configure-local-gate.mjs` | Retired staging enrollment/activation entry point now rejects invocation. Completed cutover/bootstrap records remain unchanged as history, not current instructions. |
| `scripts/failure-gate/plans.mjs`, policy `planTemplates` | Select an explicit renderer by the record's sealed contract; unknown contracts deny admission. Old plans verify unchanged. New provisioning uses the current pin and requires `coverageEvidence`. New Validation text matches the canonical section, including “Do not switch tiers.” Supported amendments record old/new contracts, tiers and coverage and reseal the plan; no existing task was amended here. |
| `scripts/failure-gate/merge-guard.mjs`, `store.mjs` | Compare registry evolution against both the last committed registry and transaction input. Reject dropped IDs/tombstones, rewritten event/run history, terminal resurrection and unsupported record/binding changes. Amend/cancel/run transitions remain supported; existing guarded classification and authentic owner-closure routes remain intact. IDs remain random UUIDs with transactional reservations. |
| `scripts/tests/failure-gate.test.mjs` | Replaced location-denial and retired activation fixtures with portable admission, contract revision, canonical rendering and committed merge-preservation fixtures. Existing wrong-tier, changed-plan, process cleanup, concurrency, credential filtering and baseline tests remain. |
| `scripts/tests/check-regression-guard.test.mjs` | Corrected one obsolete expectation: the active runner must refuse an unprovisioned plan without inserting a stub. No production guard was relaxed to satisfy the test. |

The committed comparison is cooperative repository enforcement, not an
authentication boundary against a writer who can change gate code. A checkout
with no committed registry has no historical Git comparison; its transactions
still enforce monotonic record evolution. No distributed service is introduced.
Historical cutover/revision evidence still describes the former restriction;
it is explicitly superseded history, not a second active policy.
The final scoped reference search found no remaining machine-identity admission
implementation or current instruction. Remaining matches were historical
cutover/revision evidence and the instrumented boot-read fixture; those were
retained deliberately rather than rewriting history.

## Observed maintenance checks

Direct Node test commands (no task context, no live tier invocation):

```sh
node --test --test-reporter=tap --test-timeout=45000 \
  scripts/tests/failure-gate.test.mjs \
  scripts/tests/check-regression-guard.test.mjs

node --test --test-reporter=tap --test-timeout=45000 \
  scripts/tests/check-regression-guard.test.mjs
```

Both used the existing `supervisor.py`, with a cleared child environment,
120-second/60-second outer budgets respectively and five-second cleanup.

- First invocation: **52 passed, 1 failed, 0 skipped**. All **32 gate tests
  passed**. The failing Regression Guard expectation required stub insertion
  into an unprovisioned plan; the active runner correctly refused.
- After correcting only that test, the affected Regression Guard file:
  **21 passed, 0 failed, 0 skipped**. The unchanged gate implementation/tests
  retain their observed 32/32 result; no second full-suite run is implied.
- Both supervisors reported `quiescent:true`, `blocked:null`; final rerun exit
  was 0. No owned children were left running. The real gate lock directory
  remained empty.
- Disposable fixtures verified changed boot/device inputs without reading
  machine identity, provisioning/guards/runs at a different checkout path,
  old sealed plans after a pin update, exact canonical Validation text,
  missing coverage rejection before reservation, dropped ID/tombstone and
  unauthorized binding/history rejection, supported amendments/runs/cancellation,
  wrong-tier rejection and changed-plan rejection.
- These are simulated lifecycle/copy fixtures, not a reboot, production
  recovery exercise or actual platform task-agent launch.
- `git diff --check`: passed.

Ephemeral raw logs:
`/tmp/cloudpainter-gate-maintenance-1792180022158.log` and
`/tmp/cloudpainter-regression-maintenance-1792180022158.log`.
The durable outcomes are recorded here; those temporary paths are not backups.

Required no-argument command:

```text
$ node scripts/check-failure-gate.mjs
{"mode":"active","assessment":"NOT_EXECUTION","registryRecords":1,"warnings":[]}
```

Required read-only execution-admission call:

```js
import { ROOT } from "./scripts/failure-gate/cli.mjs";
import { policy } from "./scripts/failure-gate/store.mjs";
const p = policy(ROOT, true);
console.log(JSON.stringify({
  mode: p.mode, canonicalSha256: p.canonicalSha256,
  admission: "PASS", assessment: "NOT_EXECUTION"
}));
```

Observed output:

```json
{"mode":"active","canonicalSha256":"73254fc29ec62a3966fd16508ec20dcac6cc676f65fa309a5365d400dcccf2cc","admission":"PASS","assessment":"NOT_EXECUTION"}
```

The retained original migration plan also passed read-only `checkPlan` under
its original `f9ac6757…` contract without rewriting it or launching a workload.

## Preservation, recovery and limits

Comparison with Git HEAD confirmed byte-for-byte unchanged:

- `unified-task-registry.json`: all IDs, terminal records/tombstones, tiers,
  bindings, events, run records and original sealed contracts. One existing
  record remains; no new live ID was minted.
  Registry SHA-256:
  `356fb4087afde6984113c48af695c743c765dd69b30156993637812923694346`.
- `unified-tiers.json`, `failure-baseline.json` and
  `unified-cutover-acceptance.json`.
- Policy mode, project ID, historical cutover, bootstrap, capabilities,
  native-legacy contracts and owner-direction adapter.

The recorded Remix remains **owner-confirmed**, not independently agent-verified:
`4b60cdc8-3fdb-439e-b554-21dd7e77a03e`, original source anchor
`817e478a886a46ff919d9ff1c681e3d78324406f`. Resource coverage unknowns remain in
`docs/resource-recovery-coverage.md`. This repair changes only gate source,
instructions and policy; it does not change database state, artwork,
uploads/storage, secrets, external resources or application code. No new
backup creation or recovery drill is claimed.

If rollback is requested, use an explicitly approved source recovery action
from the pre-change Git revision without overwriting newer consumed IDs,
tombstones, bindings or run history. Do not restore an old ledger over newer
work or silently reintroduce a location-bound restriction. Recovery is not
performed by this maintenance.

No deployment, post-merge database hook, remote CI, paid provider or browser
operation was run. Existing CI remains independent CI. No actual task was
approved, started, cancelled or rebound. Required maintenance is verified;
unavailable higher-tier database/browser capability routes remain explicitly
denied, not newly certified by these maintenance results.
