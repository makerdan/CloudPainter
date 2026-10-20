export type Dimensions = {
  width: number;
  height: number;
};

export const MAX_PROJECT_DIMENSION = 2000;
const DEFAULT_PROJECT_ASPECT_RATIO = 3 / 2;

export function normalizeProjectDimensions(width: unknown, height: unknown): Dimensions {
  const isUsable = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000_000;
  const validWidth = isUsable(width);
  const validHeight = isUsable(height);

  let safeWidth = validWidth ? width : validHeight ? height * DEFAULT_PROJECT_ASPECT_RATIO : 1200;
  let safeHeight = validHeight ? height : validWidth ? width / DEFAULT_PROJECT_ASPECT_RATIO : 800;
  const scale = Math.min(1, MAX_PROJECT_DIMENSION / Math.max(safeWidth, safeHeight));

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function getScaledImageDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension = 2000,
): Dimensions {
  if (![sourceWidth, sourceHeight, maxDimension].every(Number.isFinite)
    || sourceWidth <= 0 || sourceHeight <= 0 || maxDimension <= 0) {
    throw new RangeError('Image dimensions and maximum size must be positive finite numbers.');
  }

  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function fitDimensionsWithinBounds(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): Dimensions {
  if (![width, height, maxWidth, maxHeight].every(Number.isFinite)
    || width <= 0 || height <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

export function fitStageDimensions(
  projectWidth: number,
  projectHeight: number,
  availableWidth: number,
  availableHeight: number,
  maxWidth = 900,
): Dimensions {
  return fitDimensionsWithinBounds(
    projectWidth,
    projectHeight,
    Math.min(availableWidth, maxWidth),
    availableHeight,
  );
}
