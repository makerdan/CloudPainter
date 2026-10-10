# CloudPainter logo-generation and privacy regression pass

**Scope:** one browser pass at `/` and `/logo-options`, with a 390 px mobile viewport check. No application source was changed. A reusable mocked browser script is in `artifacts/cloudpainter/tests/logo-generation-privacy.browser.mjs`; it installs the `/api/logo-images` interceptor before navigating to the panel and never calls the real provider.

## Provider configuration (reported separately)

The real generation service was attempted **once only**, with the generic prompt “A simple abstract blue cloud mark” and no private sketch content. The UI returned:

> AI image generation is not configured or is unavailable. Try again later. The five logo directions and sketch workspace still work.

No live retry was made and no integration was enabled. The task setup identified the endpoint as HTTP 503 UNAVAILABLE; this pass verified the user-facing unavailable state but did not attach a response listener to independently capture the numeric status.

## Browser observations

- Before the logo journey, imported a locally generated 32×32 PNG named `privacy-guard-test.png`, drew a pen stroke, and waited for `Saved in this browser`. The captured `cloudpainter-project-v1` value was 1,801 characters; inspection confirmed one visible `Sketch layer` with one saved stroke.
- Empty prompt submission produced “Describe the logo concept first.”; 1,201 characters produced “Keep the description within 1200 characters.”. Both were blocked before the local mock received a request.
- The delayed mocked success showed a disabled “Generating…” control and progress status. A Ctrl+Enter attempt did not add a second request. The recorded request was exactly `POST { prompt: "A quiet blue cloud symbol", direction: "cloudline" }`; its only payload keys were `prompt` and `direction` (no photo, drawing, or project data).
- The generated result displayed 1024×1024 PNG. The actual downloaded `cloudpainter-logo-concept.png` was 38,206 bytes; its PNG signature was `89504e470d0a1a0a` and its IHDR dimensions were 1024×1024.
- Mocked refusal (422) rendered only “The concept could not be created. Please try again.”, kept the previous result (“previous result kept”), and left “Try again” available. Mocked server failure (500) likewise showed only generic text; the mock’s `internal failure` and `private stack details` were absent from the page, while the old image and retry controls remained.
- While a further delayed mocked generation was pending, Back to sketch workspace returned to `/`. After the mock delay elapsed, the workspace remained mounted with its reference photo and one layer; no logo result appeared there. The project value still matched the pre-journey baseline byte-for-byte. Returning to `/logo-options` presented a fresh empty result state.
- Workspace “Export PNG” remained independent of logo generation: `privacy-guard-test.png` downloaded as a valid 32×32 PNG. The project localStorage value remained unchanged.
- The five original option cards remained (`cloudline`, `viewfinder`, `gesture`, `paperfold`, `sunstudy`); counts were five `preview-header-*` and five `preview-favicon-*`. Header previews retained the CloudPainter brand.
- At 390×844, the logo page used a single-column layout. `documentElement.scrollWidth` was 375 and `clientWidth` was 375 (no horizontal overflow); prompt, select, and Generate controls fit within the viewport. Keyboard focus traversed textarea → select → Generate. In a touch-enabled context, tapping Generate on the empty form produced the local validation message.

## Verification limits / non-blocking notes

- The live HTTP status number was not captured directly during the one allowed live attempt; only the unavailable UI state was observed (the request was not repeated).
- The duplicate-submit check used the disabled in-progress button plus Ctrl+Enter; no forced click was made against the disabled control.
- Vite reconnected during the initial download inspection and remounted the logo panel. The previously captured download handle was subsequently saved with Playwright `saveAs()` and its PNG bytes were verified; the UI flow was re-run under the mock for remaining checks.
- No generated fixture or download was written into the repository; temporary downloads were saved under `/tmp`.

## Files

- Added `artifacts/cloudpainter/tests/logo-generation-privacy.browser.mjs` (reusable, mocked browser flow).
- Added this report.
- No application code or integration configuration was modified.
