---
name: Tooltip keyboard checks
description: Avoid mistaking Radix tooltip dismissal and closing animations for broken keyboard descriptions.
---

Radix tooltip triggers dismiss their descriptions on click and Escape. Focusing an already-focused trigger does not produce a new focus event. Before checking a changed description after activation, wait for the previous tooltip to finish closing, move focus to a non-tooltip control, then return.

**Why:** Immediate repeated focus after clicking, or querying while the prior closing tooltip still exists, produced false-negative and multiple-match browser assertions even though ordinary hover and keyboard navigation worked.

**How to apply:** In browser checks of stateful descriptions, exercise real focus transitions and wait for dismissed tooltip content to leave the DOM. Do not change tooltip behavior to accommodate a test that never leaves the trigger.
