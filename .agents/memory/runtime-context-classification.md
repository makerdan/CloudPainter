---
name: Runtime context classification
description: Isolated task environments can carry runtime-managed production indicators; core runtime activation must honor them.
---

Do not infer a validation child's runtime classification from the parent shell,
or assume an isolated task shell is development-classified merely because it is
being used for implementation.

**Why:** The canonical read-only inventory denied execution in an isolated task
shell while the supported tier's isolated, credential-free workload subprocesses
were separately eligible. Parent admission and workload admission were different
observations, not conflicting evidence about whether the checkout was published.

**How to apply:** Keep the actual classification intact. Resolve a genuine
eligible supported execution context and inspect its actual environment boundary
before declaring all activation blocked. Do not manually unset runtime-managed
markers or replace canonical discovery. Report parent-shell/live-service
readiness separately from assigned-tier owned-fixture/caller activation.
