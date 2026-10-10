import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { GeneratePoeImageBody, GeneratePoeImageResponse, GetImageGenerationConfigResponse } from "@workspace/api-zod";
import { generatePoeImage, isPoeConfigured, PoeImageError } from "@workspace/integrations-openai-ai-server/poe";
import { imageBudget, ImageAccessError } from "../lib/image-budget";

type Dependencies = {
  userId: (req: Request) => string | null;
  configured: typeof isPoeConfigured;
  generate: typeof generatePoeImage;
  budget: typeof imageBudget;
};

// Injection is for paid-transport-free tests; production always uses verified Clerk auth.
export function createImagesRouter(deps: Dependencies = {
  userId: req => getAuth(req).userId,
  configured: isPoeConfigured,
  generate: generatePoeImage,
  budget: imageBudget,
}): IRouter {
  const router = Router();
  router.get("/images/config", async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const userId = deps.userId(req);
    const base = { configured: deps.configured(), signedIn: Boolean(userId), allowed: false, dailyLimit: 0, remaining: 0, globalRemaining: 0 };
    if (!userId) {
      res.json(GetImageGenerationConfigResponse.parse(base));
      return;
    }
    try {
      const status = await deps.budget.status(userId);
      res.json(GetImageGenerationConfigResponse.parse({ ...base, ...status, allowed: true }));
    } catch (error) {
      if (error instanceof ImageAccessError) {
        res.json(GetImageGenerationConfigResponse.parse(base));
      } else {
        req.log.error("Image access status unavailable");
        res.status(503).json({ code: "budget_unavailable", error: "Image access could not be checked. Please try again later." });
      }
    }
  });

  router.post("/images/generate", async (req, res): Promise<void> => {
    res.setHeader("Cache-Control", "no-store");
    const userId = deps.userId(req);
    if (!userId) {
      res.status(401).json({ code: "unauthorized", error: "Sign in to generate images." });
      return;
    }
    const origin = req.get("origin");
    const allowedHosts = [req.get("host"), process.env.REPLIT_DEV_DOMAIN].filter(Boolean);
    try {
      if (!origin || !allowedHosts.includes(new URL(origin).host)) throw new Error("Wrong origin");
    } catch {
      res.status(403).json({ code: "authorization_denied", error: "Generate images from the CloudPainter app." });
      return;
    }
    const parsed = GeneratePoeImageBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.prompt.trim()) {
      res.status(400).json({ code: "invalid_request", error: "Enter a prompt between 1 and 1,000 characters and choose an approved Poe model." });
      return;
    }
    // Authorize before configuration checks and before any paid transport.
    try {
      await deps.budget.status(userId);
    } catch (error) {
      const denied = error instanceof ImageAccessError;
      res.status(denied ? error.status : 503).json({
        code: denied ? error.code : "budget_unavailable",
        error: denied ? error.message : "Image access could not be checked. Please try again later.",
      });
      return;
    }
    if (!deps.configured()) {
      res.status(503).json({ code: "not_configured", error: "Poe is not configured on the server." });
      return;
    }
    let reservation: string;
    try {
      // Membership is rechecked under the same transaction as the durable limits.
      reservation = await deps.budget.reserve(userId);
    } catch (error) {
      if (error instanceof ImageAccessError) {
        if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
        res.status(error.status).json({ code: error.code, error: error.message });
      } else {
        req.log.error("Image budget reservation failed");
        res.status(503).json({ code: "budget_unavailable", error: "Spending limits could not be checked. No image request was sent." });
      }
      return;
    }
    const input = parsed.data;
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on("close", disconnect);
    const started = performance.now();
    try {
      if (res.destroyed) return;
      const image = await deps.generate(input, controller.signal);
      if (!res.destroyed) res.json(GeneratePoeImageResponse.parse(image));
      req.log.info({ provider: "poe", model: input.model, durationMs: Math.round(performance.now() - started), outcome: "success" }, "Image generation completed");
    } catch (error) {
      const failure = error instanceof PoeImageError ? error : new PoeImageError("upstream_error", "Poe image generation did not complete.");
      req.log.warn({ provider: "poe", model: input.model, code: failure.code, durationMs: Math.round(performance.now() - started) }, "Image generation failed");
      if (!res.destroyed) res.status(failure.status).json({ code: failure.code, error: failure.message });
    } finally {
      res.off("close", disconnect);
      try {
        await deps.budget.release(reservation);
      } catch {
        // The lease expires; the durable attempt remains charged.
        req.log.error("Image concurrency lease release failed");
      }
    }
  });
  return router;
}

export default createImagesRouter();
