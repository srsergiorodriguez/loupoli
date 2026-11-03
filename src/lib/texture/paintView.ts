/** Square texture display bounds inside a paint canvas. */
export interface PaintBounds {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** Fit the texture square into a paint canvas with padding. */
export function paintBounds(
  width: number,
  height: number,
  padding = 24
): PaintBounds {
  const size = Math.max(1, Math.min(width, height) - padding * 2);
  return {
    x: (width - size) / 2,
    y: (height - size) / 2,
    size
  };
}

/** Convert canvas-space paint coordinates into texture pixels. */
export function paintPointToTexture(
  x: number,
  y: number,
  width: number,
  height: number,
  textureWidth: number,
  textureHeight: number,
  padding = 24
): { x: number; y: number } | null {
  const bounds = paintBounds(width, height, padding);
  if (
    x < bounds.x ||
    y < bounds.y ||
    x > bounds.x + bounds.size ||
    y > bounds.y + bounds.size
  ) {
    return null;
  }
  return {
    x: ((x - bounds.x) / bounds.size) * textureWidth,
    y: ((y - bounds.y) / bounds.size) * textureHeight
  };
}

/** Convert a screen-space brush diameter into texture-space radius. */
export function paintTextureRadius(
  screenDiameter: number,
  width: number,
  height: number,
  textureWidth: number,
  padding = 24
): number {
  const bounds = paintBounds(width, height, padding);
  return Math.max(0.5, (screenDiameter / 2) * (textureWidth / bounds.size));
}
