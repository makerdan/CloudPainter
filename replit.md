# CloudPainter

A browser-based creativity app for drawing imagined shapes over photographs with transparent layers, local project saving, and PNG export.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Photo-card regression checks

- `pnpm --filter @workspace/cloudpainter run test:image-dimensions` — image proportions
- Install the browser once with `pnpm --filter @workspace/cloudpainter exec playwright install chromium`.
- With the existing preview running, use `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" pnpm --filter @workspace/cloudpainter run test:photo-card`. For another host, set the URL to its running CloudPainter page instead.
- Browser tests use isolated local storage and do not start another server. Failed-run traces go to the ignored `generated-artifacts/` directory.

## Poe image-generation checks

- `pnpm --filter @workspace/integrations-openai-ai-server run test:poe` — mocked provider, model allowlist, errors, cancellation, and image-safety checks; no paid inference.
- `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" pnpm --filter @workspace/cloudpainter run test:poe-images` — isolated model-picker, preview, preservation, error, and missing-configuration checks against the running app.
- `GET /api/images/config` checks local credential availability without contacting Poe. `POST /api/images/generate` only accepts the four approved models. The old `/api/openai/generate-image` route is removed.
- Live paid Poe probes require explicit approval and are not part of ordinary validation.

## Poe spending authorization

- Only approved Clerk accounts may generate images. Membership and normal/admin roles are server-owned in the existing database; signup alone grants no spending access.
- Daily UTC request budgets: normal 2, admin 15, all accounts combined 20. The shared five-attempt/ten-minute cap and two concurrent slots are durable across workers and restarts.
- Potentially transmitted failures still count; never automatically retry or refund them.
- See `docs/validation/poe-spending-controls.md` for approval, deployment setup, and paid-transport-free regression checks.


## Workspace tooltip checks

- Reuse `TooltipButton` for new workspace buttons: supply a descriptive `description`, keep the accessible name, and do not add a native `title`.
- With an authorized existing preview running, use `CLOUDPAINTER_TEST_URL="https://${REPLIT_DEV_DOMAIN}/" pnpm --filter @workspace/cloudpainter run test:tooltips`. Set `CHROMIUM_PATH` if using a system Chromium instead of Playwright's installed browser.
- These checks cover hover, focus, disabled wrappers, dynamic states, portal positioning, and touch taps without starting a server. The suite is capped at four minutes; artifacts go under ignored `generated-artifacts/`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cloudpainter/` — CloudPainter React + Vite app
- `artifacts/api-server/` — shared API service, including the Poe-only image-generation endpoint
- `lib/integrations-openai-ai-server/` — server-only integration package; CloudPainter image generation uses its Poe adapter
- `artifacts/mockup-sandbox/` — component preview sandbox

## Architecture decisions

- CloudPainter saves editable projects in the current browser. Drawing content is never sent for inference; local outlining never sends photo pixels. Hosted outlining is an explicit, consent-gated exception that sends only a downsized selected reference-photo region.
- Clerk manages accounts and verified sessions. Only named palette colors are saved in PostgreSQL per account; signing out never changes ownership of the device's local project.
- Palette requests carry the current session ID as a transition/CSRF guard, use private no-store responses, and compare revisions to avoid overwriting changes made on another device. No browser bearer-token plumbing.
- Required account configuration: provisioned `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`. Production proxy variables are supplied by the host; do not set them manually.
- Palette regression checks: `pnpm --filter @workspace/api-server run test:palettes` (isolated schema rolled back in the development DB, never production), `pnpm --filter @workspace/cloudpainter run test:palettes` (session transitions and payload privacy).
- Canvas drawing layers are independent of the source photo so the original remains unchanged.
- Image-generation prompts use Poe only, with Nano-Banana-Pro, Nano-Banana-2, GPT-Image-2.5-Sunburst, or Flux-2-Turbo. No provider/model substitution or Replit AI fallback is permitted for images. Uploaded photos and sketches are not sent; usage consumes the connected Poe account's points.
- The Poe adapter reads POE_API_KEY lazily and supports linked secrets. The old direct OpenAI route is removed. The anonymous generation endpoint has an instance-wide five-request/ten-minute cap and two concurrent requests; these are not durable, per-user billing limits.
- Generated images are previewed before the user explicitly starts a new sketch with them.
- `/logo-options` sends only the entered logo prompt and optional direction ID to `/api/logo-images`. Results are session-only PNG concepts, never applied to the live brand.

## Logo Image Generation

- Poe is the only runtime image provider. Configure `POE_API_KEY` as a Replit Secret (create at https://poe.com/api/keys); the credential stays server-side. Generations consume the key owner's Poe points. The older Replit OpenAI integration credentials do not participate or provide fallback.
- Poe's documented endpoint is `POST https://api.poe.com/v1/chat/completions` (not `/images/generations`), using the code-owned Flux-2-Turbo bot from the project's four-model allowlist, sent as `flux-2-turbo` to match Poe's catalog. No new model or provider fallback is added. The server downloads media from an allowlisted Poe CDN host with redirects blocked and a 12 MiB response limit, then decodes/re-encodes it into a 1024-square PNG. See https://creator.poe.com/docs/external-applications/openai-compatible-api.
- `pnpm --filter @workspace/api-server run test:logo-api` — mocked HTTP/API and provider-contract checks, no paid generations.
- `pnpm --filter @workspace/cloudpainter run test:logo-ui` — portable mocked component interaction tests, no Vite port settings required.
- `pnpm --filter @workspace/api-server run verify:logo-live` — explicitly makes one Poe-points-consuming generation through the routed development URL; validates/decode-checks the PNG and saves it in ignored `generated-artifacts/`.
- Workspace build shells need `PORT=26247 BASE_PATH=/ pnpm run build`. Managed workflows inject these automatically; API routing is owned separately at `/api` in development and production.
- Prompt limit: 1–1,200 characters; JSON body: 8 KiB; provider response: 12 MiB; decoded PNG: 8 MiB. Only fully decoded 1024-square PNGs are returned, with metadata removed and `Cache-Control: no-store`.
- Generation has a 90-second deadline. The SDK and media download receive the abort signal, do not automatically retry, and use the deadline. Leaving the page aborts the client request. Upstream cancellation is best-effort and cannot guarantee avoidance of Poe point charges.
- Anonymous protection is process-local: at most two concurrent calls, five attempts per IP and twelve total per ten minutes, bounded IP bookkeeping. Forwarded IP headers are deliberately not trusted; proxy users can share an IP limit. Restarts reset these counters. Multiple replicas need a shared budget/access gate before widening public access.
- Missing configuration returns a safe `UNAVAILABLE` response without stopping health checks, the five static SVG directions, photo import, autosave or sketch PNG export.

## Product

### Outline assistance

- Outline opens a read-only, visible-photo preview with On-device (default), Hosted AI, and Trace an edge methods. Nothing changes until Accept adds a standard editable brush stroke to the selected visible layer.
- On-device uses `Xenova/detr-resnet-50-panoptic` through Transformers.js in a disposable WASM worker. It recognizes common classes, not guaranteed imagined figures. Model assets may download from Hugging Face, but pixels remain local. Copies and preprocessing tensors are bounded to 512 pixels; one worker thread, 90-second inference deadline, no hosted fallback.
- Edge tracing follows connected Sobel image edges within a user-selected region, without object-name recognition. Both local methods can be cancelled by terminating their worker.
- Hosted outlining uses a separate exact `GPT-Image-2` mask-use-case registry, not another option in the four-model image generator. Real synthetic, dog, and two-cat requests verified mask-image output; masks remain approximate and require user review. See `reports/poe-mask-probe.md`.
- `/api/outlines/config` checks configuration and approved-account access without paid inference. `/api/outlines` requires a verified Clerk session, matching session header, same-origin request, explicit consent, a subject description, and the existing durable image spending budget. Each sent attempt remains charged even after cancellation; no retries or model/provider substitution.
- Only PNG/JPEG inference crops, at most 512 KiB and 16–512 pixels per side, are accepted. Server padding preserves aspect ratio. Masks must be bounded square neutral black/white images; output is at most eight normalized contours of at most 1,024 points each. Client maps them back to the selected visible region and then into standard project stroke coordinates.
- Photos are ephemeral server buffers: no durable uploads, payload logging, source-photo modification, or remote image-URL inputs. Only existing pinned, allowlisted Poe CDN downloads are accepted for provider output.
- Hosted consent discloses transmission to Poe/OpenAI and points spending. Poe's privacy center lists OpenAI retention of 30 days; no zero-retention guarantee is made. Its API ignores `store`, so this flag cannot establish privacy. See https://poe.com/privacy_center.
- Photo, view, layer, region, method, sensitivity, subject, and account changes invalidate previews or requests. Late results cannot commit. Changing controls revokes hosted consent. Canvas resizing cancels the visible-photo snapshot rather than misaligning a contour.
- Checks: `pnpm --filter @workspace/cloudpainter run test:outline`, `test:outline-ui`, `pnpm --filter @workspace/api-server run test:outline`. `verify:outline-fixtures` only reprocesses already saved real provider results; it never sends paid requests. The standalone `scripts/probe-poe-mask.ts` requires owner approval for each paid run and is not included in CI.

- Import a photo or start with a blank canvas, draw using Brush, Pencil, Pen or Eraser, and manage transparent layers.
- Undo and redo edits, autosave and restore browser-local projects, and export the visible composition as PNG.
- Each instrument remembers its size; color selection preserves the active drawing instrument or returns from Eraser to the last drawing instrument. Brush style remains separate from Pencil and Pen.
- Legacy saved `pen` strokes retain their original brush appearance. New pencil and ink records pin their instrument recipe and seed for stable redraw/export.
- See `docs/validation/drawing-instruments.md` for scoped, bounded instrument regression checks.

## Gotchas

- Browser-local project saves are tied to that browser and device; they do not synchronize between devices.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
