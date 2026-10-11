---
name: Browser image failure fixtures
description: Reliable Playwright setup for exercising browser image decode-error handlers.
---

When a browser regression must exercise an image decode-error callback, simulate the failing image load explicitly with a scoped `Image` test double that dispatches an `error` event asynchronously after `src` is assigned. Malformed data URLs may still be treated as decodable, while aborting remote image requests can leave the test waiting.

**Why:** Chromium accepted a malformed data URL in a decode-failure test, and an aborted remote request did not reach the expected completed-image state. Explicit asynchronous event dispatch exercised the error callback deterministically.

**How to apply:** Install the test double only after the page and its saved image have loaded, and only in the browser test that needs the failure path. Keep the asynchronous dispatch so the application has time to attach its `onerror` handler.
