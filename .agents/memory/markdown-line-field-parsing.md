---
name: Markdown line-field parsing
description: A regex pitfall when parsing labeled Markdown declarations line by line.
---

For line-oriented Markdown fields, match optional spaces and tabs (`[ \t]*`) after a label rather than `\s*`. In multiline regexes, `\s*` can consume line breaks and absorb the next field, making an empty declaration appear populated or a standalone marker appear to contain another field.

**Why:** The Regression Guard checker initially accepted incorrect field boundaries because the whitespace matcher crossed newlines; fixtures caught it when validating empty fields and standalone N/A markers.

**How to apply:** When parsing Markdown labels with line anchors, keep optional whitespace horizontal and include adjacent-field / empty-value fixtures.
