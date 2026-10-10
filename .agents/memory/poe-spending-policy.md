---
name: Poe spending approval
description: Owner's generation audience and conservative handling of possible billed requests.
---

Only explicitly approved signed-in accounts may spend the connected Poe account's points.
Normal and administrator accounts have different request allowances; new signups must
not receive spending access automatically.

**Why:** The owner explicitly selected approved accounts only before public sharing,
with smaller normal-account allowances and a shared global cap.

**How to apply:** Preserve explicit owner approval when adding membership-management
features or changing authorization. Keep ambiguous transmitted attempts charged:
a request budget is not the same as an exact Poe-point budget. Never infer approval
from signing up or from user-editable profile metadata.
