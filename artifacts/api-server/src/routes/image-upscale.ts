import { getAuth } from "@clerk/express";
import { Router, json, type ErrorRequestHandler, type Request } from "express";
import { UpscalePoeImageResponse } from "@workspace/api-zod";
import { imageBudget, ImageAccessError } from "../lib/image-budget";
import { validateUpscaleRequest, PoeUpscaleError, upscaleWithPoeAssistant } from "../lib/poe-upscale";

type Budget = typeof imageBudget;
type Dependencies = {
  userId: (req: Request) => string | null;
  configured: () => boolean;
  upscale: typeof upscaleWithPoeAssistant;
  budget: Budget;
};

const jsonLimit = "11mb";

export function createImageUpscaleRouter(deps: Dependencies = {
  userId: req => getAuth(req).userId,
  configured: () => Boolean(process.env.POE_API_KEY),
  upscale: upscaleWithPoeAssistant,
  budget: imageBudget,
}) {
  const router = Router();
  router.post("/images/upscale", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!req.is("application/json") || req.headers["sec-fetch-site"] === "cross-site") {
      res.status(403).json({ code: "authorization_denied", error: "Send images from the CloudPainter app." });
      return;
    }
    const userId = deps.userId(req);
    if (!userId) {
      res.status(401).json({ code: "unauthorized", error: "Sign in to upscale images." });
      return;
    }
    const origin = req.get("origin");
    const allowedHosts = [req.get("host"), process.env.REPLIT_DEV_DOMAIN].filter(Boolean);
    try {
      if (!origin || !allowedHosts.includes(new URL(origin).host)) throw new Error("Wrong origin");
    } catch {
      res.status(403).json({ code: "authorization_denied", error: "Send images from the CloudPainter app." });
      return;
    }
    res.locals.upscaleUserId = userId;
    next();
  }, json({ limit: jsonLimit, strict: true }), async (req, res) => {
    const userId = res.locals.upscaleUserId as string;
    const input = req.body as unknown;
    let reservation: string | undefined;
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    try {
      // Reject malformed inputs before asking the account-budget service or Poe.
      const checked = await validateUpscaleRequest(input);
      if (res.destroyed || controller.signal.aborted) return;
      try {
        await deps.budget.status(userId);
      } catch (error) {
        if (error instanceof ImageAccessError) {
          res.status(error.status).json({ code: error.code, error: error.message });
        } else {
          res.status(503).json({ code: "budget_unavailable", error: "Image access could not be checked. No request was sent." });
        }
        return;
      }
      if (!deps.configured()) {
        res.status(503).json({ code: "not_configured", error: "Poe is not configured on the server." });
        return;
      }
      if (res.destroyed || controller.signal.aborted) return;
      try {
        reservation = await deps.budget.reserve(userId);
      } catch (error) {
        if (error instanceof ImageAccessError) {
          if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
          res.status(error.status).json({ code: error.code, error: error.message });
        } else {
          res.status(503).json({ code: "budget_unavailable", error: "Spending limits could not be checked. No image request was sent." });
        }
        return;
      }
      if (res.destroyed) return;
      const result = await deps.upscale(checked, controller.signal);
      if (!res.destroyed) res.json(UpscalePoeImageResponse.parse(result));
    } catch (error) {
      if (error instanceof ImageAccessError) {
        res.status(error.status).json({ code: error.code, error: error.message });
      } else if (error instanceof PoeUpscaleError) {
        res.status(error.status).json({ code: error.code, error: error.message });
      } else {
        res.status(502).json({ code: "upscale_failed", error: "Poe Assistant could not complete the upscale. It was not retried." });
      }
    } finally {
      res.off("close", disconnect);
      if (reservation) {
        try {
          await deps.budget.release(reservation);
        } catch {
          // The lease expires; the durable attempt remains charged.
        }
      }
    }
  });
  const parseError: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error?.type === "entity.too.large" ? 413 : 400).json({
      code: error?.type === "entity.too.large" ? "payload_too_large" : "invalid_request",
      error: error?.type === "entity.too.large"
        ? "The PNG is too large to upscale."
        : "Send a valid 4×/8× PNG upscale request.",
    });
  };
  router.use("/images/upscale", parseError);
  return router;
}

export default createImageUpscaleRouter();
