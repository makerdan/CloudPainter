---
name: Markdown line-field parsing
description: A regex pitfall when parsing labeled Markdown declarations line by line.
---

For line-oriented Markdown fields, match optional spaces and tabs (`[ \t]*`) after a label rather than `\s*`. In multiline regexes, `\s*` can consume line breaks and absorb the next field, making an empty declaration appear populated or a standalone marker appear to contain another field.

Before validating Markdown field-shaped declarations, exclude fenced code blocks and blockquotes so examples cannot satisfy required fields.

**Why:** Raw line matching can both cross field boundaries and treat illustrative Markdown as live declarations; focused fixtures exposed both failure modes.

**How to apply:** When parsing Markdown labels with line anchors, keep optional whitespace horizontal, ignore fenced and quoted examples, and include adjacent-field / empty-value fixtures.
