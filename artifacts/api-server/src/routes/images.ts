import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { GeneratePoeImageBody, GeneratePoeImageResponse } from "@workspace/api-zod";
import { generatePoeImage, isPoeConfigured, PoeImageError } from "@workspace/integrations-openai-ai-server/poe";

const router: IRouter = Router();
let activeGenerations = 0;
const generationLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  // Conservative instance-wide spending cap for the existing anonymous app.
  keyGenerator: () => "cloudpainter-image-generation",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { code: "rate_limited", error: "Generation limit reached. Please wait a few minutes before trying again." },
});

router.get("/images/config", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ configured: isPoeConfigured() });
});

router.post("/images/generate", (req, res, next) => {
  const origin = req.get("origin");
  const allowedHosts = [req.get("host"), process.env.REPLIT_DEV_DOMAIN].filter(Boolean);
  try {
    if (!origin || !allowedHosts.includes(new URL(origin).host)) throw new Error("Wrong origin.");
  } catch {
    res.status(403).json({ code: "authorization_denied", error: "Generate images from the CloudPainter app." });
    return;
  }
  const parsed = GeneratePoeImageBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.prompt.trim()) {
    res.status(400).json({ code: "invalid_request", error: "Enter a prompt between 1 and 1,000 characters and choose an approved Poe model." });
    return;
  }
  next();
}, generationLimit, async (req, res): Promise<void> => {
  if (activeGenerations >= 2) {
    res.setHeader("Retry-After", "30");
    res.status(429).json({ code: "rate_limited", error: "Image generation is busy. Please try again shortly." });
    return;
  }
  const input = GeneratePoeImageBody.parse(req.body);
  const controller = new AbortController();
  const disconnect = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", disconnect);
  activeGenerations++;
  res.setHeader("Cache-Control", "no-store");
  const started = performance.now();
  try {
    const image = await generatePoeImage(input, controller.signal);
    if (!res.destroyed) res.json(GeneratePoeImageResponse.parse(image));
    req.log.info({ provider: "poe", model: input.model, durationMs: Math.round(performance.now() - started), outcome: "success" }, "Image generation completed");
  } catch (error) {
    const failure = error instanceof PoeImageError ? error : new PoeImageError("upstream_error", "Poe image generation did not complete.");
    req.log.warn({ provider: "poe", model: input.model, code: failure.code, durationMs: Math.round(performance.now() - started) }, "Image generation failed");
    if (!res.destroyed) res.status(failure.status).json({ code: failure.code, error: failure.message });
  } finally {
    activeGenerations--;
    res.off("close", disconnect);
  }
});

export default router;
