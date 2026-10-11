---
name: Workspace type declarations
description: Stale project-reference declarations can report missing API exports even when runtime source is current.
---

If an artifact reports missing shared API exports that exist in current source, distinguish stale TypeScript declarations from missing workspace dependency links before changing imports or regenerating the API contract.

**Why:** Runtime imports can resolve current source while TypeScript project references use older declaration output. Separately, an artifact can declare a workspace dependency correctly while its local `node_modules` link is missing, causing Vite to fail at runtime.

**How to apply:** Check the artifact's workspace links as well as its declaration output. Refresh valid links with `pnpm install --offline --frozen-lockfile`; rebuild the affected library when declarations are stale. Do not change imports or the API contract until the mismatch is identified.
