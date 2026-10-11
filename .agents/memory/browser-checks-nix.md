---
name: Browser checks on Nix
description: Shared-library setup for running locally installed Chromium on Replit's Nix environment.
---

When setting up Chromium checks on this Nix environment, install its shared-library dependencies through the supported system-package setup. Do not assume that installing Mesa provides GBM: a separate `libgbm` package may be required.

**Why:** Chromium initially could not launch here because shared libraries were missing; installing the usual browser dependencies with Mesa still left GBM unavailable.

**How to apply:** If a new browser version fails before tests begin, inspect its missing shared libraries first. Treat that as a test-environment blocker, not an application regression.

For PDF renderer checks, Poppler's `pdftoppm` is available on the environment's PATH and can rasterize exported PDFs without adding a Node PDF-rendering dependency.

**Why:** Rasterizing the generated document verifies page placement and clipping in the rendered result, beyond checking the PDF structure or embedded image alone.

**How to apply:** Use `pdftoppm` for renderer-level PDF assertions. If it is unavailable in another environment, treat that as a missing test prerequisite rather than silently skipping the rendering check.
