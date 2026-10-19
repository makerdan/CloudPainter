---
name: Validation scan ordering
description: Why reporting-only repository policy checks run after substantive checks in a fail-fast workload.
---

When a required repository policy scan can reveal source defects whose repairs
are outside the approved validation-only scope, schedule it after substantive
required checks rather than letting it hide their execution evidence.

**Why:** Delivering validation coverage must not silently authorize product or
workflow repairs just to obtain a green run. Keeping other results observable
lets the owner distinguish delivered coverage from unresolved source findings.

**How to apply:** Preserve every required command and its actual failure. Any
workload-order change still uses the adopted maintenance and supported amendment
routes; never use a passing subset, alias or suppression to continue.
