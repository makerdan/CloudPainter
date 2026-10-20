---
name: Workload delta fixture boundaries
description: Preserve exact historical workload-delta assertions while adding later authorized tier coverage.
---

Chain exact workload-delta checks through immutable before/after delivery
snapshots. When a later authorized addition changes the current table, keep
earlier delta cases on their verified delivered boundary and compare the entire
current table against that boundary in the new cases. Pin the snapshot identity;
do not drop old checks or weaken comparisons to selected fields.

**Why:** Comparing every historical addition directly with today's full table
would reject legitimate subsequent additions. Checking only selected budgets
would instead miss lost commands or changed inheritance.

**How to apply:** For each separately authorized workload extension, preserve the
complete prior table, test the exact minimal delta and full inherited selection,
and retain prior delivery assertions against their own immutable boundary.
