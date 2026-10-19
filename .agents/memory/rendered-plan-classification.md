---
name: Rendered plan classification
description: Scope-lint fixtures need full rendered plans, not only isolated prose.
---

Exercise scope classification against complete rendered plans, including neutral
metadata, as well as prose snippets.

**Why:** Generated headings can themselves contain risk words and make legitimate
cosmetic or test-only exclusions fail even when their actual scope is unchanged.
Snippet-only fixtures can hide that interaction.

**How to apply:** When extending plan representations or scope classifiers, keep
full-render exclusion cases and check that recorded assessment metadata neither
creates nor erases material scope. Semantic coverage still needs executor review.
