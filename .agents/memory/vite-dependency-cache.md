---
name: Vite dependency cache after upgrades
description: Distinguishing stale prebundled React dependencies from actual package-version conflicts.
---

Vite may retain a prebundled dependency from the old React version even after pnpm shows matching updated React and React DOM versions.

**Why:** A required authentication SDK update produced a runtime version-mismatch overlay despite matching installed packages; removing only the generated Vite dependency cache restored the preview.

**How to apply:** After a React dependency update, if the preview reports mismatched versions, compare the installed package versions with the Vite cache metadata before changing more packages. Clear only the disposable dependency cache and restart the frontend if the metadata is stale.
