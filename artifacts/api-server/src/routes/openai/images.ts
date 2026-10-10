import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { GenerateOpenaiImageBody, GenerateOpenaiImageResponse } from "@workspace/api-zod";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";

const router: IRouter = Router();
let activeGenerations = 0;
const generationLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  // This anonymous app uses a shared cap rather than trusting forwarded IP headers.
  keyGenerator: () => "cloudpainter-image-generation",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Generation limit reached. Please wait a few minutes before trying again." },
});

router.post("/openai/generate-image", generationLimit, async (req, res): Promise<void> => {
  const parsed = GenerateOpenaiImageBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.prompt.trim()) {
    res.status(400).json({ error: "Enter a prompt between 1 and 1,000 characters and choose a supported image size." });
    return;
  }
  if (activeGenerations >= 2) {
    res.setHeader("Retry-After", "30");
    res.status(429).json({ error: "Image generation is busy. Please try again shortly." });
    return;
  }
  activeGenerations++;
  res.setHeader("Cache-Control", "no-store");
  try {
    const image = await generateImageBuffer(parsed.data.prompt.trim(), parsed.data.size ?? "1024x1024");
    res.json(GenerateOpenaiImageResponse.parse({ b64_json: image.toString("base64") }));
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    req.log.warn({ providerStatus: status }, "OpenAI image generation failed");
    if (status === 400) {
      res.status(400).json({ error: "OpenAI could not generate this image. Try a different prompt." });
    } else if (status === 429) {
      res.status(429).json({ error: "OpenAI is temporarily limiting requests. Please try again later." });
    } else {
      res.status(502).json({ error: "Image generation did not complete. Please try again later." });
    }
  } finally {
    activeGenerations--;
  }
});

export default router;
