---
name: Poe-only logo generation
description: Product decision on the sole provider for CloudPainter logo images
---

CloudPainter's logo image creation uses Poe as its only runtime image-generation connection. Do not silently switch to Replit-managed OpenAI or a direct OpenAI account for this product feature, even when those credentials are available in the workspace.

**Why:** After managed provisioning was unavailable, the user explicitly asked that Poe be the only route for image generation.

**How to apply:** Keep logo requests server-side through Poe's API. A bot accessed through Poe may have an upstream model provider, but the application must not connect directly to that provider as a fallback. If Poe is unavailable, fail explicitly and keep the static logo directions and local sketch features working.
