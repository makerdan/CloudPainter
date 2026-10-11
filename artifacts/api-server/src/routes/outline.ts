import { Router, json, type Request, type IRouter, type ErrorRequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { GenerateOutlineBody, GenerateOutlineResponse, GetOutlineConfigResponse } from "@workspace/api-zod";
import { imageBudget, ImageAccessError } from "../lib/image-budget";
import { generateHostedOutline, prepareOutline, outlineConfigured, OutlineError, OUTLINE_PROVIDER } from "../lib/outlineProvider";

type Dependencies = {
  auth: (req: Request) => { userId: string | null; sessionId: string | null };
  budget: typeof imageBudget;
  configured: typeof outlineConfigured;
  prepare: typeof prepareOutline;
  generate: typeof generateHostedOutline;
};
export function createOutlineRouter(deps: Dependencies = {
  auth: req => getAuth(req), budget: imageBudget, configured: outlineConfigured,
  prepare: prepareOutline, generate: generateHostedOutline,
}): IRouter {
  const router = Router();
  router.get("/outlines/config", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const { userId } = deps.auth(req);
    const config = { configured: deps.configured(), signedIn: Boolean(userId), allowed: false,
      model: OUTLINE_PROVIDER.model, error: "" };
    if (!config.configured) config.error = "Poe is not configured on the server.";
    else if (!userId) config.error = "Sign in to use hosted outlining.";
    else {
      try {
        const status = await deps.budget.status(userId);
        config.allowed = status.remaining > 0 && status.globalRemaining > 0;
        if (!config.allowed) config.error = "Daily Poe request allowance exhausted.";
      } catch (error) { config.error = error instanceof ImageAccessError ? error.message : "Account spending limits are unavailable."; }
    }
    res.json(GetOutlineConfigResponse.parse(config));
  });
  // Identity/origin gates precede this endpoint's larger bounded JSON parser.
  router.post("/outlines", (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const auth = deps.auth(req);
    if (!auth.userId || !auth.sessionId || req.get("X-Outline-Session") !== auth.sessionId) {
      res.status(401).json({ code: "unauthorized", error: "Sign in again; the outlining session changed." }); return;
    }
    try {
      const origin = new URL(req.get("origin") ?? "");
      if (!["https:", "http:"].includes(origin.protocol) || ![req.get("host"), process.env.REPLIT_DEV_DOMAIN].includes(origin.host)) throw new Error();
    } catch {
      res.status(403).json({ code: "origin_denied", error: "Use hosted outlining from the CloudPainter app." }); return;
    }
    if (!req.is("application/json")) { res.status(400).json({ code: "invalid_request", error: "Send a JSON inference request." }); return; }
    next();
  }, json({ limit: 720000, strict: true }), async (req, res) => {
    const parsed = GenerateOutlineBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.subject.trim() || Object.keys(req.body).some(k => !["imageBase64", "consent", "subject", "sensitivity"].includes(k))) {
      res.status(400).json({ code: "invalid_request", error: "Choose a subject, provide a bounded inference image, and explicitly consent." }); return;
    }
    const { userId } = deps.auth(req);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, OUTLINE_PROVIDER.timeoutMs);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    let reservation: string | undefined;
    try {
      await deps.budget.status(userId!);
      controller.signal.throwIfAborted();
      if (!deps.configured()) throw new OutlineError("not_configured", "Poe is not configured on the server.", 503);
      const crop = await deps.prepare(parsed.data.imageBase64, controller.signal);
      controller.signal.throwIfAborted();
      if (res.destroyed) return;
      reservation = await deps.budget.reserve(userId!);
      if (res.destroyed) return;
      const result = await deps.generate(crop, parsed.data.subject.trim(), parsed.data.sensitivity, controller.signal);
      const valid = GenerateOutlineResponse.safeParse(result);
      if (!valid.success) throw new OutlineError("invalid_contours", "The provider returned invalid contours. Nothing was drawn.");
      if (!res.destroyed) res.json(valid.data);
    } catch (error) {
      const failure = timedOut ? new OutlineError("timeout", "Hosted outlining timed out. No automatic retry was made.", 504)
        : error instanceof OutlineError || error instanceof ImageAccessError ? error
        : new OutlineError("unavailable", "Hosted outlining is temporarily unavailable.", 503);
      if (error instanceof ImageAccessError && error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      // Deliberately no image, prompt, provider body, remote URL, or thrown object logs.
      if (!res.destroyed) res.status(failure.status).json({ code: failure.code, error: failure.message });
    } finally {
      clearTimeout(timer);
      res.off("close", disconnect);
      if (reservation) {
        try { await deps.budget.release(reservation); }
        catch { req.log?.error("Outline concurrency lease release failed; attempt remains charged."); }
      }
    }
  });
  const parserError: ErrorRequestHandler = (error, _req, res, next) => {
    if (error?.type === "entity.too.large" || error instanceof SyntaxError) {
      res.status(error?.type === "entity.too.large" ? 413 : 400).json({ code: "invalid_request", error: "The inference request is too large or malformed." });
      return;
    }
    next(error);
  };
  router.use(parserError);
  return router;
}
export default createOutlineRouter();
