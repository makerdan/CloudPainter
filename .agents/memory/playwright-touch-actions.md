---
name: Playwright touch actions
description: Reliable mobile-control interaction in CloudPainter's Playwright browser tests.
---

For mobile UI controls in this Chromium harness, prefer `locator.tap()` with a touch-enabled page over a raw coordinate call to `page.touchscreen.tap()`. The raw call produced no pointer, touch, or click events on the expected control, while `locator.tap()` exercised the control successfully.

**Why:** A coordinate tap appeared to succeed but did not reach the target, making interaction assertions fail without identifying a product defect.

**How to apply:** Use touch-enabled browser contexts, assert target bounds and spacing, then use `locator.tap()` to verify mobile control behavior. Use raw touchscreen coordinates only when the test specifically needs coordinate-level input, and verify the target receives the expected events.
