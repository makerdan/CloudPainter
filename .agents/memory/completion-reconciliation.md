---
name: Completion reconciliation
description: Recheck the integrated source when completion feedback differs from the pre-completion working diff.
---

A rejected completion attempt can still leave a new local commit. When review
feedback names changes absent from the earlier working diff, inspect current HEAD
and the integrated file before making the repair.
The defective content may already be in the integrated parent commit, rather
than the feature's own diff. Preserve valid independent additions when repairing
it; a wholesale rollback can discard other completed work.

**Why:** An overlapping test-file integration introduced fixture substitutions
that were not in the one-line pre-completion working diff. The completion review
caught them after the local commit had been produced.
The same integration issue can scatter fragments across unrelated tests, so
restoring just the first reported syntax error may leave other tests unusable.

**How to apply:** Compare against the last intended version, restore only the
incorrect substitutions, retain legitimate independently merged coverage, and
verify the affected suite. Do not assume that a rejected completion leaves the
working-tree or commit state unchanged.
