/**
 * Code-owned allowlist, reviewed against Poe's public bot pages and its
 * OpenAI-compatible API documentation on 2026-10-10. Never discover models
 * through the catalogue, silently replace a selection, or switch providers.
 */
const evidence = "https://creator.poe.com/docs/external-applications/openai-compatible-api";
const common = {
  enabled: true,
  endpoint: "/v1/chat/completions",
  imageGeneration: "yes",
  useCase: "public, non-sensitive text-to-image prompts",
  maxPromptCharacters: 1000,
  maxResponseBytes: 256_000,
  timeoutMs: 120_000,
  verifiedAt: "2026-10-10",
  verifier: "Replit Agent: Poe documentation and public bot pages",
  endpointEvidence: evidence,
  reviewTrigger: "Bot availability, endpoint or media-output contract changes",
  fallbacks: [],
  failurePolicy: "Fail closed; never substitute a model or provider",
} as const;

export const POE_IMAGE_MODELS = Object.freeze({
  "Nano-Banana-Pro": { ...common, model: "Nano-Banana-Pro", evidence: "https://poe.com/Nano-Banana-Pro/api" },
  "Nano-Banana-2": { ...common, model: "Nano-Banana-2", evidence: "https://poe.com/Nano-Banana-2/api" },
  "GPT-Image-2.5-Sunburst": { ...common, model: "GPT-Image-2.5-Sunburst", evidence: "https://poe.com/GPT-Image-2.5-Sunburst" },
  "Flux-2-Turbo": { ...common, model: "Flux-2-Turbo", evidence: "https://poe.com/Flux-2-Turbo/api" },
} as const);

export type PoeImageModel = keyof typeof POE_IMAGE_MODELS;

export function isPoeImageModel(model: string): model is PoeImageModel {
  return Object.hasOwn(POE_IMAGE_MODELS, model)
    && POE_IMAGE_MODELS[model as PoeImageModel].enabled
    && POE_IMAGE_MODELS[model as PoeImageModel].imageGeneration === "yes";
}
