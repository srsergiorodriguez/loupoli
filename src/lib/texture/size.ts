/** Maximum supported texture edge in pixels. */
export const MAX_TEXTURE_DIMENSION = 4096;

/** Maximum supported texture area; keeps extreme aspect ratios bounded. */
export const MAX_TEXTURE_PIXELS = MAX_TEXTURE_DIMENSION * MAX_TEXTURE_DIMENSION;

/** Validate a requested texture size and return a user-facing error. */
export function textureSizeError(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return 'Texture dimensions must be whole pixels.';
  }
  if (width < 1 || height < 1) {
    return 'Texture dimensions must be at least 1 pixel.';
  }
  if (width > MAX_TEXTURE_DIMENSION || height > MAX_TEXTURE_DIMENSION) {
    return `Texture dimensions cannot exceed ${MAX_TEXTURE_DIMENSION} px.`;
  }
  if (width * height > MAX_TEXTURE_PIXELS) {
    return 'Texture area is too large.';
  }
  return null;
}

/**
 * Double a source texture while preserving aspect and both size limits.
 *
 * The bake atlas gets the extra area it needs without forcing a square atlas.
 */
export function bakeAtlasTargetSize(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const width = Math.max(1, sourceWidth);
  const height = Math.max(1, sourceHeight);
  const factor = Math.min(
    2,
    MAX_TEXTURE_DIMENSION / width,
    MAX_TEXTURE_DIMENSION / height,
    Math.sqrt(MAX_TEXTURE_PIXELS / (width * height))
  );
  return {
    width: Math.max(1, Math.min(MAX_TEXTURE_DIMENSION, Math.round(width * factor))),
    height: Math.max(1, Math.min(MAX_TEXTURE_DIMENSION, Math.round(height * factor)))
  };
}
