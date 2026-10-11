# CloudPainter

CloudPainter is a browser-based sketch workspace for noticing shapes in a photograph and drawing over them. You can also start with a transparent blank canvas. The editor, project data, and exports run in the browser; optional account and Poe features use the API server. This description is verified against the current workspace source, not a statement that a particular production deployment has every service configured.

## Product capabilities

### Sketching and photo navigation

- Import an image file as a reference photo or start a 1200 × 800 blank canvas. Imported images are decoded in the browser and scaled so their longest edge is at most 2000 pixels. The source photo is displayed below drawing layers and is not modified by drawing or erasing.
- Draw with Brush, Pencil, Pen, and Eraser. Brush styles are Solid round, Flat/chisel, Soft, and Dry brush. Brush, pencil, pen, and eraser sizes are remembered separately; the size control ranges from 1 to 48 project-scaled pixels. The color control includes built-in swatches and custom colors. Selecting a color while erasing returns to the last drawing instrument.
- Add, select, rename, reorder, hide/show, adjust opacity, clear, and delete drawing layers. At least one layer remains. Hidden layers are excluded from the visible composition and exports. The eraser affects marks on the selected layer, not the reference photo or other layers.
- Undo and redo apply to strokes on the selected layer. Keyboard shortcuts are Ctrl/⌘+Z to undo, Ctrl/⌘+Y or Shift+Ctrl/⌘+Z to redo, except while typing in a form field. Clearing a layer also clears that layer's undo/redo history.
- With a photo loaded, zoom from 100% to 400%, reposition the zoomed view, and reset it to its fitted position. Touch pinch-to-zoom is supported. These are view controls: the full project frame, rather than a zoomed crop, is used for export.

### Saving and recovery

- The current editable project is autosaved to this browser's `localStorage` after a 500 ms debounce and flushed on page exit. The saved project includes the reference image data and drawing records. Account-owned project/photo sync is not implemented; see `docs/cloud-project-storage-blocker.md` before promising cross-device project backup.
- A separate browser-local Saved sketches list is used for recovery when adopting a generated reference image and when restoring an existing saved sketch. Restoring first saves the current project into that list. Users can restore or delete listed snapshots.
- Starting a blank canvas or importing/replacing a photo replaces the current project; do not assume those actions create a recovery snapshot. Save/export anything important before replacing it.
- Storage estimates and a warning before some recovery-list writes help identify low browser storage, but browser quotas vary and writes can still fail. Clearing site data, using a different browser/device, or browser storage eviction can remove local projects. There is no project sync or cloud backup. Existing project data is not automatically uploaded on sign-in.

### Local exports

- PNG export composites the reference photo with visible drawing layers. Choose original dimensions, 2× size, or a US Letter/A4 print-sized canvas with match-sketch, portrait, or landscape orientation. Hidden layers are omitted. A blank canvas can remain transparent; the reference photo is fitted within the project frame. Export is composed locally and downloaded by the browser.
- PDF export creates a single flattened print page on white, with US Letter or A4 paper, portrait/landscape orientation, and ¼, ½, or ¾ inch safe margins. Export composition and PDF generation happen locally; no provider is involved. Very large canvases may exceed browser memory or canvas limits, and failures should not be treated as a completed download.

### Outlining

The Outline tool works from a preview of the visible reference photo. Select a region and sensitivity, run one of three methods, review the result, and explicitly Accept it to add an ordinary editable brush stroke to the selected visible layer. Cancel or a changed photo/view/layer discards the preview.

- **On-device** (default) uses Transformers.js and `Xenova/detr-resnet-50-panoptic` in a disposable WebAssembly worker. Its model assets may download from Hugging Face on first use; photo pixels are processed locally and are not uploaded. It can recognize some common object classes, but does not guarantee finding an imagined figure. Inference is bounded to a 512-pixel image copy and has a 90-second deadline.
- **Trace an edge** follows image edges locally in the selected region. It does not identify objects. It uses the same bounded image-copy size and can be cancelled.
- **Hosted AI** is an optional paid Poe request using the separately configured GPT-Image-2 mask workflow, not one of the image-generator model choices. It requires a signed-in account that has not been disabled, configured Poe access, a subject description, and explicit consent. Only a downsized copy of the selected visible photo region is sent through CloudPainter's API to Poe/OpenAI; sketches and other project data are not included. PNG/JPEG input copies are at most 512 KiB and 512 × 512 pixels; the server pads the image without stretching and has a 120-second provider deadline. Returned masks are bounded and converted into at most eight contours of at most 1,024 points each. The result is an approximate mask-derived contour, not guaranteed segmentation, and should be reviewed before acceptance. A request reserved for provider processing consumes an account/shared request even if it fails or is cancelled; it is not retried automatically.
- Hosted outlining temporarily handles the submitted image in server memory and does not save or log the photo payload. Changes to the photo, view, layer, region, method, sensitivity, subject, or account invalidate previews or pending requests; changing controls revokes hosted consent. The provider may retain data under its own terms; Poe's [privacy information](https://poe.com/privacy_center) describes OpenAI retention, so no zero-retention guarantee is made. Avoid sensitive photos when using hosted processing.

### Image generation and logo concepts

- **Generate image** sends the entered text prompt (up to 1,000 characters) to the selected Poe model. The four code-approved choices are Nano-Banana-Pro, Nano-Banana-2, GPT-Image-2.5-Sunburst, and Flux-2-Turbo. The prompt is sent to Poe; the current photo, sketches, and browser project are not. Results are not guaranteed. The user previews a result and chooses whether to use it as a new reference image; adopting it saves the current sketch to the local Saved sketches list first. The new image then starts a new one-layer sketch.
- Any signed-in Clerk account receives the existing normal Poe request allowance automatically when first checked. Explicitly disabled accounts remain denied, and administrator roles and prior request history are preserved. Poe points are spent from the configured Poe account; request limits are not point-price estimates.
- **Logo directions** at `/logo-options` shows five built-in vector-style explorations and offers optional raster concept generation. Logo generation requires a signed-in account that is not disabled and reserves the same durable account/global Poe budget as image generation, upscale, and hosted outlining; its existing process-local limits remain additional safeguards. It sends only the entered prompt (1–1,200 characters) and optional direction text to Poe, using the fixed Flux-2-Turbo route. It does not send the current photo, drawings, or project. The request body is limited to 8 KiB, the provider media response to 12 MiB, and the decoded PNG to 8 MiB. Only fully decoded square 1024 × 1024 PNGs are returned; metadata is removed and the response is not cached. Up to four concepts can be compared in the current page session, downloaded, or removed; they are not saved to the project or applied to CloudPainter's live identity. Transparency is not guaranteed.
- Logo-generation protection retains the process-local maximum of two active requests, five requests per IP, and twelve total per ten-minute window. Forwarded IP headers are not trusted, so users behind one proxy can share an IP limit. These counters reset on server restart; durable account/global usage is enforced separately.
- Logo generation has a 90-second server deadline and does not automatically retry. Poe media downloads accept only the code-allowlisted Poe CDN hosts, with redirects blocked. Cancellation after provider submission cannot guarantee avoiding Poe point charges.

### Poe Assistant upscale export

Upscaling is a separate, optional paid network action. After an explicit review/confirmation step, CloudPainter composites the reference photo and visible layers in the browser and sends that merged PNG to Poe Assistant with the fixed prompt “Please upscale the attached image to be 4x” or “8x”. Poe Assistant chooses the provider; CloudPainter does not promise a particular enhancement. The returned file is accepted only if it is a readable PNG at the exact requested dimensions. No automatic retry occurs. Poe may charge points if processing has started even if the user cancels or the request fails.

The feature requires configured Poe access and a signed-in account that has not been disabled. Input is limited to 8 MiB and 2048 pixels per side; requested output is limited to 8192 pixels per side and 20 megapixels. It shares the account and global image-request budgets with image generation, hosted outlining, and logo generation.

### Accounts and personal palettes

- Clerk provides sign-in/sign-up and verified sessions. Drawing and local project data are not account-owned. Signing out hides the account palette but does not sign out of, transfer, or delete the browser-local drawing.
- A signed-in user can save up to 64 named six-digit-hex colors in an account palette. PostgreSQL stores the account ID, palette color IDs/names/hex values, and revision metadata; no photos or project content are stored there. The palette is available across signed-in devices.
- Palette writes use the current verified session, same-origin protections, private no-store responses, and revision checks; the browser does not send bearer tokens. If another device changed the palette, CloudPainter reports a conflict and requires reloading rather than silently overwriting the newer revision.
- Poe image access is stored in the existing database. The first verified request provisions a normal account only when no membership row exists; this does not overwrite an administrator role or re-enable a disabled account. Account roles and enabled state are server-owned; browser fields and user-editable profile metadata cannot grant access. Database/configuration errors fail closed.

## Network, privacy, and usage boundaries

| Operation | Where it runs / what leaves the browser |
| --- | --- |
| Drawing, layer edits, photo import/navigation, autosave, PNG/PDF export, local outlining/edge tracing | The operation runs locally; photo and sketch content are not uploaded. Local outlining may download public model assets, not photo pixels. The app also fetches its declared Google Fonts and uses configured Clerk authentication endpoints; these requests are separate from project content. |
| Account palette | Clerk session plus named palette fields to CloudPainter API/PostgreSQL; no project or photo. |
| Text-to-image | Prompt and selected model to CloudPainter API/Poe; no photo or sketch. Uses Poe points and shared account/global request budgets for signed-in, non-disabled accounts. |
| Logo concept | Prompt and optional direction to CloudPainter API/Poe; no photo or sketch. Uses Poe points, the shared durable account/global budget, and additional process-local rate/concurrency protection. |
| Hosted outline | Subject description and downsized selected photo region to CloudPainter API/Poe/OpenAI after explicit consent; no drawing layers/project. Uses the shared budgets for signed-in, non-disabled accounts. |
| Poe Assistant upscale | Merged reference photo plus visible drawing layers to CloudPainter API/Poe after explicit confirmation. Uses the shared budgets for signed-in, non-disabled accounts. |

CloudPainter uses Poe as the only runtime image provider for these image features. No Replit AI/OpenAI fallback or silent model substitution is implemented. Request allowances do not correspond to fixed Poe point amounts. Provider output can fail, be refused, or differ from the requested result. Upstream cancellation cannot guarantee that an already submitted request avoids charges.

## Workspace architecture

- `artifacts/cloudpainter/` — user-facing React 19 + Vite browser app and canvas/drawing logic.
- `artifacts/api-server/` — Express 5 service. It mounts the health, palette, image-generation, upscale, hosted-outline, and logo-image routes under `/api`; Clerk middleware verifies account sessions for protected routes.
- `lib/api-spec/` — OpenAPI source and Orval code generation.
- `lib/api-client-react/` and `lib/api-zod/` — generated React Query client and shared Zod request/response schemas.
- `lib/db/` — PostgreSQL pool, Drizzle schema and database types for account palettes, image-generation access, and durable image-request reservations.
- `lib/integrations-openai-ai-server/` — server-only Poe image adapter, allowlist and bounded media validation/download helpers. Poe credentials are read lazily on the server from `POE_API_KEY`; they are not sent to the browser.
- `lib/outline-core/` — shared outline geometry and mask-contour validation.
- `artifacts/mockup-sandbox/` — development-only component preview server for workspace mockups. It dynamically renders preview components; it is not part of CloudPainter's product UI or a user-facing CloudPainter capability.

All API routes are mounted under `/api`: `GET /healthz`; `GET`/`PUT /palette`; `GET /images/config`; `POST /images/generate`; `POST /images/upscale`; `GET /outlines/config`; `POST /outlines`; and `POST /logo-images`. All Poe generation, upscale, hosted-outline, and logo requests share durable PostgreSQL-backed budgets: normal accounts receive 2 requests per UTC day, admin accounts 15, all accounts together 20, with a five-attempt rolling ten-minute cap and at most two concurrent reservations across workers. New verified accounts receive the normal role on first use; disabled accounts stay denied. Reserved attempts remain counted after success, failure, cancellation, or ambiguous timeout; only the active concurrency lease is released. Logo generation also retains the separate process-local limits described above. The separate Poe Assistant upscale has a 120-second server deadline and requires the input and output dimensions stated above.

## Setup and operation

The Replit environment is configured for Node.js 24 and PostgreSQL 16. Use pnpm workspaces from the repository root.

1. Install workspace dependencies with `pnpm install`.
2. The API server requires `DATABASE_URL` and `PORT`. Clerk account features require server-side `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and client-side `VITE_CLERK_PUBLISHABLE_KEY`. Poe-backed features additionally require server-side `POE_API_KEY`. These are configuration names only; store credentials in Replit Secrets. Production Clerk proxy settings are host-provided and should not be set manually.
3. In Replit, use the configured workflows: CloudPainter web (`pnpm --filter @workspace/cloudpainter run dev`), API server (`pnpm --filter @workspace/api-server run dev`, currently routed under `/api`), and the development-only component preview server (`pnpm --filter @workspace/mockup-sandbox run dev`). The API and Vite services require their workflow-provided `PORT`; Vite apps also require `BASE_PATH`.
4. Core editing and local exports do not call Poe. Poe features remain unavailable unless Poe is configured; Clerk-backed palette and paid image features require correctly configured Clerk and database access. Applying `pnpm --filter @workspace/db run push` changes the targeted schema; use only for development unless the production migration process is explicitly intended. The optional `pnpm --filter @workspace/api-server setup:image-access` command seeds the repository-configured initial Clerk identity as admin only when no row exists; inspect its target and `DATABASE_URL` first. Development and production Clerk IDs can differ. Any verified signed-in account receives normal Poe request access automatically unless its membership is explicitly disabled; admin assignment still requires owner authorization. See `docs/validation/poe-spending-controls.md`.

Root commands:

- `pnpm run typecheck` — canonical full workspace check: incrementally prepare shared-library declarations first, then check all artifacts and scripts.
- `pnpm run typecheck:cloudpainter` / `pnpm run typecheck:api-server` — supported focused checks from the root; prepare the same library solution before checking the selected artifact. These work with absent declarations in a clean checkout and after shared-source changes.
- `pnpm run typecheck:libs` — incrementally prepare/check shared declarations only; no application build or API generation.
- `pnpm --filter @workspace/cloudpainter run typecheck` (and the API Server equivalent) — low-level consumer-only check, **not** complete standalone validation. It requires current declarations from `typecheck:libs`; otherwise missing-output/export and downstream implicit-any errors can be misleading. Root validation uses these low-level commands only after preparation.
- `pnpm run test:workspace-typecheck` — isolated temporary fixtures exercise both focused routes with missing/stale declarations, warm repeats, nonexistent exports, library errors, and conflicting preparation. They do not modify live library outputs.
- Supported declaration-preparation routes share a fail-fast `.workspace-typecheck.lock`. Do not run raw `tsc --build` alongside them. If a check is interrupted, confirm its process and children have stopped before removing a leftover lock; the runner never reclaims one automatically.
- `PORT=26247 BASE_PATH=/ pnpm run build` — typecheck and build all packages from a shell. Choose an available port if that example port is occupied; managed workflows provide their own environment.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate client hooks and Zod schemas from the OpenAPI specification.
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes to the configured database; development use only by default.

## Validation and maintenance notes

`docs/validation/workspace-typecheck.md` records the declaration-mismatch diagnosis, bounded check outcomes, supported typecheck routes, and fixture coverage.

### Drawing and photo checks

- `pnpm --filter @workspace/cloudpainter run test:image-dimensions` — image sizing and proportions.
- Install Playwright Chromium once with `pnpm --filter @workspace/cloudpainter exec playwright install chromium`.
- With the existing preview running: `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" CLOUDPAINTER_AUTH_STATE="generated-artifacts/<authorized-state-file>" pnpm --filter @workspace/cloudpainter run test:photo-card`. Set the URL to the running CloudPainter page for another host. Signed-in cases require a valid authorized Clerk storage-state file; the harness fails explicitly if it is missing. Never fabricate or commit session state.
- Browser checks use isolated local storage and do not start another server. Failed-run traces go in ignored `generated-artifacts/`.
- New pencil/ink strokes pin their instrument recipe and seed for stable redraw/export; legacy saved `pen` strokes retain their earlier appearance. `docs/validation/drawing-instruments.md` records this contract and bounded regression commands. `docs/validation/account-palettes.md` covers palette session/privacy checks.

### Poe and image-request checks

- `pnpm --filter @workspace/integrations-openai-ai-server run test:poe` — mocked provider, model allowlist, errors, cancellation, and image-safety checks; no paid inference.
- With the existing preview running: `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" pnpm --filter @workspace/cloudpainter run test:poe-images` — isolated picker, preview/application, failure, and missing-configuration checks. Use the authorized sign-in state described by the validation harness when running signed-in cases.
- `GET /api/images/config` reports server Poe configuration and signed-in account eligibility/budget without contacting Poe for inference. `POST /api/images/generate` requires a signed-in, non-disabled account and accepts only the four listed models.
- `pnpm --filter @workspace/api-server run test:image-access` exercises durable spending controls with stubbed provider transport. `docs/validation/poe-spending-controls.md` describes authorization, development setup, and safe regression checks.
- Live Poe probes can spend points. They are not ordinary validation and require explicit owner approval. `pnpm --filter @workspace/api-server run verify:logo-live` performs one live logo generation.

### Outline, palette, logo, and tooltip checks

- `pnpm --filter @workspace/cloudpainter run test:outline` and `test:outline-ui`, plus `pnpm --filter @workspace/api-server run test:outline`, cover local/privacy geometry, UI, and API behavior without paid inference.
- `pnpm --filter @workspace/api-server run verify:outline-fixtures` reprocesses saved provider fixtures only; it does not send a paid request. The standalone `artifacts/api-server/scripts/probe-poe-mask.ts` requires owner approval for each live run.
- Upscale regression checks: `pnpm --filter @workspace/api-server run test:image-upscale` and `pnpm --filter @workspace/cloudpainter run test:upscale-ui`; these use stubbed provider responses.
- Palette checks: `pnpm --filter @workspace/api-server run test:palettes` uses a rolled-back isolated schema in the development database, never production; `pnpm --filter @workspace/cloudpainter run test:palettes` covers session transitions and payload privacy.
- Logo checks: `pnpm --filter @workspace/api-server run test:logo-api` and `pnpm --filter @workspace/cloudpainter run test:logo-ui` use mocks; they do not require paid generations.
- Reuse `TooltipButton` for workspace buttons: provide a descriptive `description`, preserve the accessible name, and do not add a native `title`. With an authorized existing preview running, use `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" pnpm --filter @workspace/cloudpainter run test:tooltips`. Set `CHROMIUM_PATH` to use system Chromium. This suite covers hover, focus, disabled wrappers, dynamic states, portal positioning, and touch taps; it does not start a server and writes artifacts under ignored `generated-artifacts/`.

## Verified scope and limitations

- Source verifies the browser editor and these supporting routes/packages. The mockup sandbox is development tooling, not part of the user-facing product.
- Editable projects are browser-local, not synchronized or backed up to an account. Only named palette colors and server-owned image-access/request records are in PostgreSQL.
- Hosted AI results are approximate and provider-dependent; this documentation does not promise accuracy, availability, zero retention, or a particular number of provider points.
- Provider settings, disabled-account status, database readiness, and production deployment behavior depend on runtime configuration. Their presence in source does not prove they are enabled in a deployed environment.
