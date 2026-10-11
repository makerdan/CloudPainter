---
name: Browser fixture module stubs
description: Constraints when replacing Vite-served modules through Playwright route fulfillment.
---

When a Playwright fixture fulfills a Vite module request directly, keep the replacement JavaScript module import-free unless the fixture itself performs Vite transformation.

**Why:** Route-fulfilled JavaScript is served to the browser without Vite rewriting bare package imports. A stub importing `react` fails module resolution before the page can mount.

**How to apply:** For browser-only identity fixtures, use a test-owned global and trigger a normal app rerender, or serve a pre-bundled/transformed module rather than importing packages from raw route content.
