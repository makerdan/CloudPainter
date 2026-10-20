---
name: On-device outline fixtures
description: Public image fixtures for local segmentation browser checks must be validated against real model labels and contours.
---

Validate candidate public fixtures with the actual in-browser local model and check both the expected subject label and contour bounds. A recognizable animal photo can still produce only background labels or a full-frame mask.

**Why:** Image appearance and metadata do not predict the model's panoptic labels or mask geometry; unit tests cannot detect those quality failures.

**How to apply:** When adding browser-level local segmentation fixtures, make one bounded inference per fixture, preserve strict subject and geometry assertions, and report model-stage failures without using hosted inference.
