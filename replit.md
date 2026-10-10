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

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cloudpainter/` — CloudPainter React + Vite app
- `artifacts/api-server/` — shared API service, including the OpenAI image-generation endpoint
- `lib/integrations-openai-ai-server/` — server-only Replit-managed OpenAI SDK integration
- `artifacts/mockup-sandbox/` — component preview sandbox

## Architecture decisions

- CloudPainter saves editable projects in the current browser; photos and drawings are not uploaded to a server.
- Canvas drawing layers are independent of the source photo so the original remains unchanged.
- Image-generation prompts are sent to OpenAI via Replit AI Integrations; uploaded photos and sketches are not sent. Usage is billed to Replit credits.
- Generated images are previewed before the user explicitly starts a new sketch with them.

## Product

- Import a photo or start with a blank canvas, draw using a pen or eraser, and manage transparent layers.
- Undo and redo edits, autosave and restore browser-local projects, and export the visible composition as PNG.

## Gotchas

- Browser-local project saves are tied to that browser and device; they do not synchronize between devices.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
