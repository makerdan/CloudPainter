export type PoeUpscaleScale = 4 | 8;

export function buildPoeUpscalePrompt(scale: PoeUpscaleScale): string {
  return `Please upscale the attached image to be ${scale}x`;
}
