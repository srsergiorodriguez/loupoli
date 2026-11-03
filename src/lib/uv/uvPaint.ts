import type { UvProjection } from './uvView';

/**
 * Map panel-local CSS pixels to texture pixels.
 *
 * UV V=0 is the bottom of the texture while canvas Y grows downward, so the
 * mapping flips vertically. Points outside the texture are returned unclamped;
 * the layer context clips the brush.
 */
export function uvCanvasToTexture(
  x: number,
  y: number,
  projection: UvProjection,
  textureWidth: number,
  textureHeight: number
): [number, number] {
  const u = (x - projection.offsetX) / projection.scale;
  const v =
    (projection.height - projection.offsetY - y) / projection.scale;
  return [u * textureWidth, (1 - v) * textureHeight];
}

/** Convert a CSS-pixel brush diameter into texture-pixel radius. */
export function brushTextureRadius(
  cssSize: number,
  projection: UvProjection,
  textureWidth: number
): number {
  return Math.max(0.5, (cssSize / 2 / projection.scale) * textureWidth);
}
