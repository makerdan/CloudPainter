---
name: Clock deadline fixture design
description: Keep startup denial and dispatched timeout proofs distinct in runtime supervisor tests.
---

Treat startup-inclusive deadline expiry and a dispatched command's timeout as
different test scenarios with exact, phase-specific outcomes. Prove command
readiness and an actual reversal during the phase being tested; a passing retry
or a count of wall-clock calls is insufficient.

**Why:** A short execution fixture could expire during watchdog startup and
correctly retain its lease before dispatch, while its assertion incorrectly
required the normal post-dispatch timeout result. Combining queue proof after
that assertion also left queue coverage unexecuted on failure.

**How to apply:** Keep a controlled short-budget pre-dispatch reproduction,
give the independent dispatched scenario explicit finite startup headroom,
and run queue proof independently. Do not accept interchangeable exit codes
or delete retained uncertain leases to make tests pass.
