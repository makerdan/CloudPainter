---
name: Node structured failure reporters
description: Do not infer machine-readable failure output from a piped Node test invocation.
---

Failure adapters must explicitly select their expected reporter, rather than
infer TAP from noninteractive or redirected output.

**Why:** The Node 24 runtime emitted the human-readable spec reporter in a piped
validation run. The safe parser correctly refused baseline matching, but the
missing format selection prevented classification and isolated retries.

**How to apply:** For Node commands whose assessment needs TAP test identities
and diagnostics, supply `--test-reporter=tap` in both the tier command and its
isolated retry route. Unknown formats must remain fail-closed.
