---
name: Vite dependency cache after upgrades
description: Stale React prebundles and first-use worker dependencies can produce misleading runtime failures.
---

Vite may retain a prebundled dependency from the old React version even after pnpm shows matching updated React and React DOM versions.

**Why:** A required authentication SDK update produced a runtime version-mismatch overlay despite matching installed packages; removing only the generated Vite dependency cache restored the preview.

**How to apply:** After a React dependency update, if the preview reports mismatched versions, compare the installed package versions with the Vite cache metadata before changing more packages. Clear only the disposable dependency cache and restart the frontend if the metadata is stale.

Prebundle large worker-only dependencies explicitly when first-use dependency discovery would interrupt an in-progress user flow.

**Why:** Vite can discover an import only after a worker starts, optimize it, then reload the page. The page reload looks like a silently cancelled operation even though the worker has not started model inference.

**How to apply:** When a first-run dialog disappears before model asset requests begin, inspect Vite logs for dependency optimization and page reload before blaming the model or GPU. Include the worker dependency in startup optimization and verify the interrupted flow.
