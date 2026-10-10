# CloudPainter logo image creation validation

## Status

CloudPainter logo generation connects **only to Poe**. The API does not use the managed OpenAI integration, even if its configuration exists elsewhere in the workspace. The Poe key is configured as a server-side Replit Secret; no value was displayed or saved in project files.

The routed live verification generated an actual image through Poe, downloaded it from Poe's media CDN, re-encoded it to PNG, decoded every pixel, and saved it as ignored `generated-artifacts/logo-verification/live-logo.png`. The resulting 1024 × 1024 image was also visually inspected. Generated concepts do not replace the five original SVG directions or CloudPainter's live identity.

## Baseline and final checks

| Check | Result |
| --- | --- |
| Initial `pnpm run typecheck` | Passed |
| Initial image-dimension checks | 5 passed |
| Initial bare `pnpm run build` | Failed because the mockup Vite config requires `PORT`; no failure was waived |
| `PORT=26247 BASE_PATH=/ pnpm run build` | Passed across all packages, including its full typecheck |
| `pnpm run typecheck` | Passed |
| `pnpm --filter @workspace/api-spec run codegen` | Passed; checked-in API client and Zod contracts regenerated |
| `pnpm --filter @workspace/cloudpainter run test:image-dimensions` | 5 passed |
| `pnpm --filter @workspace/api-server run test:logo-api` | 15 passed, mocked Poe transport only |
| `pnpm --filter @workspace/cloudpainter run test:logo-ui` | 12 passed, mocked API only |
| Routed `/api/healthz` | HTTP 200 |
| Routed `/api/logo-images` with a valid prompt | HTTP 200 with validated Poe-generated PNG |
| `pnpm --filter @workspace/api-server run verify:logo-live` | Passed; full PNG decode and local save of generated image |
| Mobile screenshot of `/logo-options` | At 390 px, prompt, selector, privacy notice and navigation render without browser errors |

The build retains non-fatal tooltip sourcemap and bundle-size warnings. The generated POST client requires `dom.iterable` for `Headers.entries`; the client TypeScript library configuration includes it rather than editing generated code.

After syncing with main, the API spec, generated clients, packages and lockfile were regenerated together, retaining account palettes and the separate existing Poe image tool. The existing Poe adapter suite and frontend palette-transition suite passed, and the routed palette operation still returns 401 for an anonymous caller. The final logo model is the already-approved Flux-2-Turbo bot; live generation and full PNG decoding passed again for that bot. Matching installed React packages required clearing only Vite's stale generated dependency cache before the mobile preview rendered correctly.

## Automated coverage

API/provider tests cover:
- Strict, trimmed, bounded prompt and direction validation; unknown fields, photos, projects, client models and arbitrary URLs rejected.
- All five server-owned direction inspirations; text-only provider input.
- Poe-compatible SDK request construction against mocked transport: fixed `https://api.poe.com/v1/chat/completions`, approved Flux-2-Turbo bot, one non-streamed text-only choice, and only a Poe media URL download. The generated prompt, photo and project contents never enter the media request.
- Poe moderation, missing points, invalid key, timeouts, throttling and failures; safe normalized errors and no automatic retries.
- Signal propagation through SDK and media download, deadline aborts and navigation/disconnect aborts.
- Text-only/multiple/malformed provider outputs, untrusted image hosts, redirect attempts, oversized/HTML/corrupt media, wrong dimensions and bounded provider HTTP bodies. The real Poe response's long URL-as-alt-label format has a dedicated regression case.
- No-store headers, no generation CORS opt-in, JSON/body limits, malformed request handling.
- Per-IP/global rate limits, window reset, concurrency blocking and holding a slot until an aborted upstream call actually settles.

Component tests cover:
- Empty and oversized validation without requests.
- Direction payload, request abort signal, successful preview and named PNG download.
- Safe errors, refusal, retry and retaining previous results.
- Duplicate submissions, disabled progress and accessible busy status.
- Timeout handling, offline/HTML errors, invalid images.
- Object URL replacement/unmount cleanup, navigation abort and ignoring late results.
- No local-storage writes and keyboard-only generation.
- Normalized refusal/unavailability consumed through the real generated fetch client with mocked transport; correct retry visibility and safe text.

## Routing and limits

CloudPainter owns `/`; the shared API owns `/api` in both artifact development and production routing. The generated client calls `/api/logo-images`, not a hardcoded port or host. The creation panel never reads reference photos, project storage or drawing layers.

The API accepts 8 KiB JSON with a 1–1,200-character prompt, one optional code-owned direction, and no other fields. It returns a fully decoded/re-encoded, metadata-stripped 1024-square PNG no larger than 8 MiB. Poe HTTP responses are capped at 12 MiB; source media is capped at 8 MiB, decoded with a 2048-square upper bound, and contained in a square PNG. Flux-2-Turbo is bound to the project's existing four-model allowlist and sent with Poe's lowercase catalog ID; no extra model is added. Requests are never silently retried. Poe's chat-compatible API does not guarantee native PNG, quality or size fields, so these are enforced on our final output instead.

Generation has a 90-second server deadline and 100-second browser deadline. Cancellation propagates to Poe and the media fetch; provider-side cancellation and avoided Poe-point charges cannot be guaranteed. Two active provider operations are allowed per process; five attempts per IP and twelve globally per ten minutes. Limits are process-local and reset on restart. Forwarded IP headers are not trusted, so shared-proxy users may share an IP limit. Account-level point protection and sign-in are being addressed in a separate task, not claimed here.

The provider requires a Poe API key and consumes that account's Poe points. When the key is absent or points are exhausted, the logo page displays an actionable safe error and retains all static directions and local sketch functions.

## Single browser verification pass

An earlier single browser pass exercised mocked API generation, rendered the returned image, downloaded and decoded a 1024-square PNG, retained local project state and independent sketch export, aborted on navigation, and confirmed a 390px layout without horizontal overflow. All five original cards and header/favicon previews remained. **That browser pass predates Poe setup; it does not claim a live Poe browser click.** The later live Poe pass above verified the real provider and image independently.

Details: `artifacts/cloudpainter/reports/logo-generation-privacy-pass.md`. Reusable mocked script: `artifacts/cloudpainter/tests/logo-generation-privacy.browser.mjs`.

The browser tester's refusal mock used a non-contract error object, so its observed generic-error handling is not claimed as normalized provider-refusal verification. The component suite separately verifies the real generated fetch client receiving canonical `REFUSED` (non-retryable) and `UNAVAILABLE` (retryable) responses. The reusable browser script was corrected to use that canonical error contract; that script correction was syntax-checked, not given another browser pass.
