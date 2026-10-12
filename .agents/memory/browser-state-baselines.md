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

When controlling browser timers, avoid pausing at a fixed timestamp that may
already be in the past for the page. Prefer a current page-derived time, or let
short debounce timers run naturally when exact timing is not central to the check.

**Why:** A hard-coded test clock timestamp became stale relative to the page clock,
making a storage-denial regression fail before reaching its assertions.

**How to apply:** Freeze time only when deterministic timer control is needed,
and derive the pause point from the current browser clock.

After changing selection in an autosaved editor, wait for the selected ID to
persist before using it to identify the next layer or history target.

**Why:** The UI updates before debounced local storage, so an immediate storage
read can return the previous selection and make a valid layer-history test target
the wrong layer.

**How to apply:** Wait for the expected selected ID and layer count in the saved
project before drawing on, switching to, or asserting history for the new layer.

In multi-tab Chromium checks, background-page autosave timers may fire much later
than their configured debounce interval; a 500 ms timer took about 10 seconds in
the headless test context.

**Why:** Browser background-tab throttling can distort timing-based assumptions
without changing which tab ultimately wrote the shared snapshot.

**How to apply:** Observe the actual persisted revision/snapshot to establish
write order, record elapsed time, and do not treat the debounce interval as a
guaranteed cross-tab deadline.

Compare persisted values at the same serialization layer; do not compare a
UI-normalized project with a raw recovery-history snapshot.

**Why:** A history assertion treated default-valued photo fields as absent in
the open project while the stored recovery snapshot retained them, producing a
false persistence failure.

**How to apply:** When checking a current project against saved history, either
use raw persisted values for both or normalize both sides consistently.
