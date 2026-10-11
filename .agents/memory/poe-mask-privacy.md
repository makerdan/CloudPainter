---
name: Poe mask semantics and privacy
description: Generated mask output and ignored API storage flags must not be overstated as exact segmentation or zero retention.
---

Treat a generated mask image as an approximate, reviewable contour source, not proof of a dedicated segmentation API or pixel-exact preservation. A successful prompt containing `use_mask` does not establish what that option does without a control.

**Why:** Poe's bot description says “use mask” without defining mask-output semantics; real image outputs can look suitable while still simplifying boundaries. Its OpenAI-compatible documentation also says `store` is ignored, and the privacy center describes provider retention rather than zero retention.

**How to apply:** Verify actual output alignment before introducing a hosted mask model, preserve preview-and-accept approval, disclose downstream photo transmission and retention uncertainty, and never use `store: false` as evidence that photos are not retained.
