# Task execution

Read `replit.md` and `docs/validation/unified-policy.json` before new work.
The only Failure Gate target is the canonical
`.agents/skills/failure-gate-unified/SKILL.md`.

Follow `docs/validation/unified-local-execution.md`. While staging, only the
explicitly enrolled migration specification can provision/execute. After an
accepted cutover, every new task plan and its validation must use the verified
local provisioner, one bound tier and sealed plan context. Do not use independent
app checks as a substitute for the task's tier.

An isolated task checkout is not the authoritative workspace merely because it
has the same path, environment/project identifier or copied policy. If local
authority admission fails, stop and report BLOCKED; do not manufacture an ID,
edit the receipt/authority flags, or implement an unprovisioned new task. Do not
rebind historical/native task IDs. Existing CI remains independent CI.
