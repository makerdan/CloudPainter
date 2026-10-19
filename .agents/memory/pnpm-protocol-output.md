---
name: Exact protocol output through pnpm
description: pnpm lifecycle banners can break otherwise-correct machine-readable helper output.
---

Test exact stdout/stderr through the documented root pnpm command, not only the
underlying executable. pnpm lifecycle banners use its reporter setting;
`loglevel=silent` alone does not suppress those banners in the installed version.

**Why:** Direct helper tests and explicit `pnpm --silent` probes can pass while
the ordinary documented root command still adds banners to a strict protocol.

**How to apply:** Preserve the quiet reporter configuration for machine-readable
entrypoints. When changing package-manager configuration or versions, exercise
the documented command without extra quiet flags.
