---
name: Poe spending approval
description: Owner's generation audience and conservative handling of possible billed requests.
---

Any verified, signed-in Clerk identity receives the existing normal Poe request
allowance on first budget check. Explicitly disabled accounts remain denied, and
automatic provisioning must preserve existing administrator roles and attempt history.
Normal and administrator accounts retain separate allowances, while every paid Poe
route uses the shared durable account, global, burst, and concurrency limits.

**Why:** The owner later explicitly required automatic standard access for every
authenticated account, while keeping revocations, elevated roles, and the existing
usage safeguards intact. Request limits are not exact Poe-point budgets.

**How to apply:** On protected Poe routes, derive ownership only from verified Clerk
identity, create the normal membership only when no row exists, and keep disabled
accounts blocked. Keep ambiguous transmitted attempts charged. Never trust
user-editable profile metadata or treat request budgets as point-price guarantees.
