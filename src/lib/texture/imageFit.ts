/** How an imported image is mapped into an existing texture. */
export type ImageFitMode = 'contain' | 'cover' | 'stretch' | 'native';

/** Horizontal/vertical anchor for fitted image overflow or margins. */
export type ImageAnchor = 0 | 1 | 2;

/** One fitted source rectangle in texture pixels. */
export interface ImageFitRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Options used by the image-import dialog. */
export interface ImageFitOptions {
  readonly mode: ImageFitMode;
  readonly anchorX?: ImageAnchor;
  readonly anchorY?: ImageAnchor;
}

/** Compute the destination rectangle for one image fit mode. */
export function imageFitRect(
  imageWidth: number,
  imageHeight: number,
  textureWidth: number,
  textureHeight: number,
  options: ImageFitOptions = { mode: 'contain' }
): ImageFitRect {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    textureWidth <= 0 ||
    textureHeight <= 0
  ) {
    return { x: 0, y: 0, width: textureWidth, height: textureHeight };
  }
  const anchorX = options.anchorX ?? 1;
  const anchorY = options.anchorY ?? 1;
  let width = textureWidth;
  let height = textureHeight;
  if (options.mode === 'contain') {
    const scale = Math.min(
      textureWidth / imageWidth,
      textureHeight / imageHeight
    );
    width = imageWidth * scale;
    height = imageHeight * scale;
  } else if (options.mode === 'cover') {
    const scale = Math.max(
      textureWidth / imageWidth,
      textureHeight / imageHeight
    );
    width = imageWidth * scale;
    height = imageHeight * scale;
  } else if (options.mode === 'native') {
    width = imageWidth;
    height = imageHeight;
  }
  return {
    x: ((textureWidth - width) * anchorX) / 2,
    y: ((textureHeight - height) * anchorY) / 2,
    width,
    height
  };
}
