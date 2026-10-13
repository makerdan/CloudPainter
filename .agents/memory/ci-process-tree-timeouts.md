---
name: CI process-tree timeouts
description: Safely bound CI commands that may spawn descendant processes.
---

Keep a suite's deadline supervisor outside the suite's isolated process group.
Start the suite in a fresh session/group, wait for either the suite or its timer,
then signal only that group's negative PGID with TERM followed by KILL after a
bounded grace period. Preserve timeout as a nonzero suite result and reap the
leader.

**Why:** GNU `timeout` escalation can terminate its own controller with the
command group while a TERM-ignoring descendant survives. A process-group owner
outside that group can complete escalation and avoid affecting workspace or
runner services.

**How to apply:** For CI jobs where a suite may spawn children, use an explicit
session boundary and a parent-owned timer. Test with local stubs that record
their PIDs and PGIDs, include a child that ignores TERM, verify no owned process
remains, and confirm later suites still run and the stage still fails.
