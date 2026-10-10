---
name: Workspace type declarations
description: Stale project-reference declarations can report missing API exports even when runtime source is current.
---

If an artifact typecheck reports missing shared API exports that exist in current source, check whether TypeScript is reading stale built declarations before changing imports or regenerating the API contract.

**Why:** Runtime imports can resolve the current source while TypeScript project references resolve older declaration output, creating false errors across otherwise unrelated features.

**How to apply:** Rebuild the affected library's TypeScript project, then rerun the artifact check. Do not change the API contract solely to address stale declaration output.
