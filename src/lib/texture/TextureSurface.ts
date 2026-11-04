import type { TextureAsset } from './TextureAsset';

/** Pixel rectangle on a 2D canvas. */
export interface TextureSurfaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Prepared high-DPI canvas context and its logical dimensions. */
export interface TextureSurfaceContext {
  readonly context: CanvasRenderingContext2D;
  readonly dpr: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Prepare a texture preview canvas consistently for UV, Paint, and thumbnails.
 *
 * The caller still owns the canvas element; this helper owns sizing, DPR,
 * background, and reset. All texture previews must use it so sampling and
 * backing-store behavior cannot drift between panes.
 */
export function prepareTextureSurface(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): TextureSurfaceContext | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-panel-strong')
      .trim() || '#1a1a1f';
  context.fillRect(0, 0, width, height);
  return { context, dpr, width, height };
}

/**
 * Draw the asset composite with the asset's own sampling filter.
 *
 * No caller is allowed to choose a different smoothing mode for the same
 * texture. 2D UV/Paint previews and the 3D material therefore agree.
 */
export function drawTextureSurface(
  context: CanvasRenderingContext2D,
  asset: TextureAsset,
  rect: TextureSurfaceRect,
  opacity = 1
): void {
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  context.save();
  context.imageSmoothingEnabled = asset.textureFilter === 'linear';
  context.globalAlpha = Math.min(1, Math.max(0, opacity));
  context.drawImage(asset.image, rect.x, rect.y, rect.width, rect.height);
  context.restore();
}
