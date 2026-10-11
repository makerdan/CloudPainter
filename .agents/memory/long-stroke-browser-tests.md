---
name: Long-stroke browser tests
description: Reliable browser coverage for incremental drawing with long synthetic pointer sequences.
---

When a browser test dispatches many continuous `pointermove` events in one synchronous script, React may defer draft updates until the script returns. A following `pointerup` can therefore finish an older draft, even though every move event was dispatched. Yield to a later event-loop turn between synthetic moves when the test must exercise incremental rendering and persistence.

**Why:** A batched pointer sequence produced no persisted stroke because pointer-up ran before the queued draft updates committed.

**How to apply:** In browser tests for long drawing gestures, pace pointer moves with a small task yield, then verify the saved point count and reload rendering rather than trusting event dispatch alone.
