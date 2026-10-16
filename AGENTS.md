# Task execution

Read `replit.md` and `docs/validation/unified-policy.json` before new work.
The only Failure Gate target is the canonical
`.agents/skills/failure-gate-unified/SKILL.md`.

Follow `docs/validation/unified-local-execution.md`. While staging, only the
explicitly enrolled migration specification can provision/execute. After an
accepted cutover, every new task plan and its validation must use the verified
local provisioner, one bound tier and sealed plan context. Do not use independent
app checks as a substitute for the task's tier.

If Failure Gate admission or a plan guard fails, follow the canonical skill's
"Installing, updating and repairing the gate" section. Never manufacture an ID
or implement an unprovisioned task. Do not rebind historical/native task IDs.
Existing CI remains independent CI.
