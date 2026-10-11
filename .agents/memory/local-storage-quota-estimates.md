---
name: Local storage quota estimates
description: Distinguish browser-wide storage estimates from localStorage's own approximate capacity.
---

`navigator.storage.estimate()` reports aggregate origin storage and quota, not a localStorage-specific limit. Use a separate, conservative localStorage usage estimate and treat the common 5 MB capacity as a guideline rather than a guaranteed browser limit. A browser-wide estimate can provide an additional warning signal.

**Why:** CloudPainter stores sketches in localStorage, so comparing its data only with the much larger origin quota could miss localStorage quota exhaustion.

**How to apply:** For browser apps that persist large data in localStorage, track the origin's key/value size separately, report the estimate as approximate, and use StorageManager data only as complementary context.
