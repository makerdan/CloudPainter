import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { GetSettingsResponse, SaveSettingsBody, SaveSettingsResponse } from "@workspace/api-zod";
import type { SettingsStore } from "../lib/settingsStore";

const defaults = { textSize: 100, drawingTool: "brush", brushStyle: "round", brushSize: 8 } as const;

export function createSettingsRouter(store: SettingsStore) {
  const router = Router();
  const auth: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const { userId, sessionId } = getAuth(req);
    if (!userId || !sessionId || req.get("X-Settings-Session") !== sessionId) {
      res.status(401).json({ error: "Sign in again to access your settings." });
      return;
    }
    res.locals.settingsOwner = userId;
    next();
  };
  router.use("/settings", auth);
  router.get("/settings", async (_req, res): Promise<void> => {
    try {
      res.json(GetSettingsResponse.parse(await store.read(res.locals.settingsOwner) ?? defaults));
    } catch {
      res.status(503).json({ error: "Could not load your settings. Please retry." });
    }
  });
  router.put("/settings", async (req, res): Promise<void> => {
    if (req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Cross-site settings changes are not allowed." });
      return;
    }
    const parsed = SaveSettingsBody.strict().safeParse(req.body);
    if (!parsed.success || Object.keys(req.body ?? {}).some(key =>
      !["textSize", "drawingTool", "brushStyle", "brushSize"].includes(key),
    )) {
      res.status(400).json({ error: "Settings contain unsupported or out-of-range values." });
      return;
    }
    try {
      res.json(SaveSettingsResponse.parse(await store.save(res.locals.settingsOwner, parsed.data)));
    } catch {
      res.status(503).json({ error: "Could not save your settings. Please retry." });
    }
  });
  return router;
}
