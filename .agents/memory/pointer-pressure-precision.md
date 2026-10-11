---
name: Pointer pressure precision
description: Preserve stylus pressure samples as received while making browser tests tolerant of floating-point representation.
---

PointerEvent pressure values may arrive with Float32 precision (for example, `0.18` as `0.18000000715255737`). Keep the received sample in the saved stroke; compare browser-captured values approximately in tests rather than rounding user input.

**Why:** Rounding changes recorded input and is unnecessary for deterministic replay; exact decimal assertions can fail even when the browser delivered the intended pressure.

**How to apply:** When testing pressure-aware pointer input, validate sample order and compare values with a small tolerance or a test-only rounded projection.
