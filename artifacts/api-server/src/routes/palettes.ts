import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { GetPaletteResponse, SavePaletteBody, SavePaletteResponse } from "@workspace/api-zod";

type Palette = { revision: number; colors: { id: string; name: string; hex: string }[] };
export interface PaletteStore {
  read(userId: string): Promise<Palette>;
  save(userId: string, palette: Palette): Promise<Palette | null>;
}

// Injectable storage only; production authentication always uses verified Clerk middleware.
export function createPaletteRouter(store: PaletteStore) {
  const router = Router();
  const auth: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const { userId, sessionId } = getAuth(req);
    if (!userId || !sessionId || req.get("X-Palette-Session") !== sessionId) {
      res.status(401).json({ error: "Sign in again to access your palette." });
      return;
    }
    res.locals.paletteOwner = userId;
    next();
  };
  router.use("/palette", auth);
  router.get("/palette", async (_req, res): Promise<void> => {
    try {
      res.json(GetPaletteResponse.parse(await store.read(res.locals.paletteOwner)));
    } catch {
      res.status(503).json({ error: "Could not load your palette. Please retry." });
    }
  });
  router.put("/palette", async (req, res): Promise<void> => {
    // Custom session header prevents browser form CSRF; Fetch Metadata rejects cross-site fetches.
    if (req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Cross-site palette changes are not allowed." });
      return;
    }
    const parsed = SavePaletteBody.strict().safeParse(req.body);
    if (!parsed.success ||
        req.body.colors.some((raw: object) => Object.keys(raw).some(key => !["id", "name", "hex"].includes(key))) ||
        new Set(parsed.data.colors.map(c => c.id)).size !== parsed.data.colors.length ||
        parsed.data.colors.some(c => !c.name.trim())) {
      res.status(400).json({ error: "Use up to 64 named colors with six-digit hex values." });
      return;
    }
    try {
      const result = await store.save(res.locals.paletteOwner, {
        revision: parsed.data.revision,
        colors: parsed.data.colors.map(c => ({ id: c.id, name: c.name.trim(), hex: c.hex.toLowerCase() })),
      });
      if (!result) {
        res.status(409).json({ error: "Your palette changed elsewhere. Reload before editing." });
        return;
      }
      res.json(SavePaletteResponse.parse(result));
    } catch {
      res.status(503).json({ error: "Could not save your palette. Please retry." });
    }
  });
  return router;
}
