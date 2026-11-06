/** User zoom/pan for the Paint texture surface. */
export interface PaintViewState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

/** Texture display bounds inside a paint canvas. */
export interface PaintBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Fit the texture into a paint canvas with padding and zoom/pan.
 *
 * The display uses the asset's aspect ratio so rectangular textures are not
 * painted through a stretched square proxy.
 */
export function paintBounds(
  canvasWidth: number,
  canvasHeight: number,
  textureWidth: number,
  textureHeight: number,
  padding = 24,
  view?: PaintViewState
): PaintBounds {
  const safeTextureWidth = Math.max(1, textureWidth);
  const safeTextureHeight = Math.max(1, textureHeight);
  const availableWidth = Math.max(1, canvasWidth - padding * 2);
  const availableHeight = Math.max(1, canvasHeight - padding * 2);
  const zoom = Math.max(0.1, view?.zoom ?? 1);
  const scale =
    Math.min(
      availableWidth / safeTextureWidth,
      availableHeight / safeTextureHeight
    ) * zoom;
  const width = Math.max(1, safeTextureWidth * scale);
  const height = Math.max(1, safeTextureHeight * scale);
  return {
    x: (canvasWidth - width) / 2 + (view?.panX ?? 0),
    y: (canvasHeight - height) / 2 + (view?.panY ?? 0),
    width,
    height
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
  const bounds = paintBounds(
    width,
    height,
    textureWidth,
    textureHeight,
    padding,
    view
  );
  if (
    x < bounds.x ||
    y < bounds.y ||
    x > bounds.x + bounds.width ||
    y > bounds.y + bounds.height
  ) {
    return null;
  }
  return {
    x: ((x - bounds.x) / bounds.width) * textureWidth,
    y: ((y - bounds.y) / bounds.height) * textureHeight
  };
}

/** Convert a screen-space brush diameter into texture-space radius. */
export function paintTextureRadius(
  screenDiameter: number,
  width: number,
  height: number,
  textureWidth: number,
  textureHeight = textureWidth,
  padding = 24,
  view?: PaintViewState
): number {
  const bounds = paintBounds(
    width,
    height,
    textureWidth,
    textureHeight,
    padding,
    view
  );
  return Math.max(0.5, (screenDiameter / 2) * (textureWidth / bounds.width));
}
