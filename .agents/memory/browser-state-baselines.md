---
name: Browser state baselines
description: Avoid false persistence and focus regressions in browser checks of UI-only changes.
---

Wait for the initial debounced local project save before comparing storage around
a UI-only action.

**Why:** A disclosure-preservation assertion compared an uninitialized null
storage value with the normal first autosave and incorrectly reported a project
mutation. A retry timing difference hid the problem rather than establishing a baseline.

**How to apply:** Start with isolated storage, wait for initialization, and then
capture the snapshot immediately before the action under test.

Use real keyboard input before asserting `:focus-visible`, rather than relying
on programmatic focus immediately after a pointer click.

**Why:** Chromium preserves input modality; programmatic focus after pointer
interaction does not necessarily request the keyboard focus ring.

**How to apply:** Navigate with Tab or another keyboard action, focus the target,
and then inspect its visible outline.

Seed reload fixtures in a one-shot initialization script, not by writing storage
in the outgoing mounted document.

**Why:** Navigation can flush the outgoing document's in-memory project over a
fixture written directly to storage, so the incoming document loads the wrong
baseline even though the fixture write succeeded.

**How to apply:** Seed after the outgoing pagehide flush and use a session marker
to prevent later reloads from reseeding and hiding persistence regressions.
