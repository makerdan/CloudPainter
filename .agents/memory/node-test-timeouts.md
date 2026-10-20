---
name: Node test timeout supervision
description: Applying finite Node test deadlines through existing package scripts.
---

Do not inject Node's `--test-timeout` through NODE_OPTIONS; the runtime rejects
that flag there. Pass it as a CLI argument to each actual `node --test` child,
including children launched through tsx.

**Why:** An authorized local check stopped before dispatch because Node rejected
the environment flag. An outer process deadline alone does not establish a
test/hook deadline.

**How to apply:** When local validation requires finite inherited test and hook
limits, verify how the canonical script launches its test runner and inject the
CLI limit without altering the canonical command's coverage. Keep independent
outer supervision and task-scoped authorization.
