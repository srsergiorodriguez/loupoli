/** User zoom/pan for the Paint texture surface. */
export interface PaintViewState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

/** Square texture display bounds inside a paint canvas. */
export interface PaintBounds {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** Fit the texture square into a paint canvas with padding and zoom/pan. */
export function paintBounds(
  width: number,
  height: number,
  padding = 24,
  view?: PaintViewState
): PaintBounds {
  const baseSize = Math.max(1, Math.min(width, height) - padding * 2);
  const zoom = Math.max(0.1, view?.zoom ?? 1);
  const size = baseSize * zoom;
  return {
    x: (width - size) / 2 + (view?.panX ?? 0),
    y: (height - size) / 2 + (view?.panY ?? 0),
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
  padding = 24,
  view?: PaintViewState
): { x: number; y: number } | null {
  const bounds = paintBounds(width, height, padding, view);
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
  padding = 24,
  view?: PaintViewState
): number {
  const bounds = paintBounds(width, height, padding, view);
  return Math.max(0.5, (screenDiameter / 2) * (textureWidth / bounds.size));
}
