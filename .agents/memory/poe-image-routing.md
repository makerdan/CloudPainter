---
name: Poe-only image generation
description: User-approved provider and model choices for CloudPainter image generation.
---

CloudPainter image generation must offer only these model options, through Poe:

- Nano-Banana-Pro
- Nano-Banana-2
- GPT-Image-2.5-Sunburst
- Flux-2-Turbo

Do not add direct OpenAI/Replit image generation, extra models, or automatic provider/model substitutions.

**Why:** The user explicitly requested these model options “only thru Poe.”

**How to apply:** Preserve this restriction in the model picker, server-side allowlist, provider dispatch, and fallback behavior. Verify each model's required API capability before enabling it.
