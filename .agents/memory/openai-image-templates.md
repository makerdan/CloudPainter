---
name: OpenAI image template compatibility
description: Replit-provided image helper templates can contain legacy image-size values.
---

Check image-size values against the supported model guidance when adopting Replit's OpenAI image templates. The supplied helper and sample contract can still list legacy 512×512 and 256×256 values even though the helper selects gpt-image-1.

**Why:** Those template size values did not match the integration's documented gpt-image-1 sizes, so copying them unchanged would expose unsupported requests.

**How to apply:** Use the supported gpt-image-1 sizes (1024×1024, 1536×1024, 1024×1536, or auto) consistently in the server helper, API contract, and UI.
