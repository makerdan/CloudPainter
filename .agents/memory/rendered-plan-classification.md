---
name: Rendered plan classification
description: Scope-lint fixtures need full rendered plans, not only isolated prose.
---

Exercise scope classification against complete rendered plans, including neutral
metadata, as well as prose snippets.

**Why:** Generated headings can themselves contain risk words and make legitimate
cosmetic or test-only exclusions fail even when their actual scope is unchanged.
Snippet-only fixtures can hide that interaction.

Definitions can describe safety requirements without requesting their activation.
Classify the requested change separately from quoted content and ordinary use of
existing admission procedures, while still treating changes to supported policy
or workflow as material.

**Why:** Word matching alone cannot distinguish installing descriptive guidance
from changing the rules consumers must follow; treating either as universally
exempt or universally material gives incorrect admission decisions.

Do not erase an entire descriptive sentence before assessing its embedded
directives. Unknown instructional content is not evidence of neutrality.

**Why:** A sentence that merely starts with “the definition includes” can still
instruct consumers to disable access checks. Positive neutral-copy tests alone
miss this coverage bypass; full rendered mixed-work negative controls matter.

**How to apply:** When extending plan representations or scope classifiers, keep
full-render exclusion cases and check that recorded assessment metadata neither
creates nor erases material scope. Semantic coverage still needs executor review.
For incoming package provenance whose instructional neutrality remains unresolved,
map concrete consistency/path-safety coverage to that boundary. Preserve the
approved scope rather than cycling declaration labels or relaxing policy to pass.
