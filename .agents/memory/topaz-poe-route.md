---
name: Poe Assistant upscaling route
description: CloudPainter's user-approved Poe Assistant route and exact upscaling prompt.
---

CloudPainter uses Poe's fixed `assistant` API model. The user requires exactly “Please upscale the attached image to be 4x” or “Please upscale the attached image to be 8x”, according to the selected scale. Do not add TopazLabs, punctuation, or further instructions to that prompt. Poe chooses the image provider; do not claim guaranteed TopazLabs processing.

Poe's privacy material says bot interactions, including uploaded images, may be shared with providers. Disclose that the confirmed action sends the merged image to Poe and uses points from the connected account.

**Why:** The user explicitly selected Assistant and then supplied this exact prompt after an authorized live Topaz-specific prompt returned only text saying Assistant did not have access to TopazLabs.

**How to apply:** Preserve the user-initiated confirmation, approved-account and request-budget gates, exact output validation, and no-retry behavior. Never describe the result as guaranteed to have been processed by TopazLabs. Sources: https://poe.com/Assistant, https://poe.com/Assistant/api, https://creator.poe.com/docs/external-applications/openai-compatible-api, https://poe.com/pages/privacy, https://topazlabs.com/privacy.
