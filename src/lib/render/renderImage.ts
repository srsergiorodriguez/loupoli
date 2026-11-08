import type { RenderUpscale } from './renderSettings';

/** A centered fit rectangle inside a target frame. */
export interface FitRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Fit a source rectangle into a target without changing its aspect ratio. */
export function fitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): FitRect {
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const safeTargetWidth = Math.max(1, targetWidth);
  const safeTargetHeight = Math.max(1, targetHeight);
  const scale = Math.min(
    safeTargetWidth / safeSourceWidth,
    safeTargetHeight / safeSourceHeight
  );
  const width = safeSourceWidth * scale;
  const height = safeSourceHeight * scale;
  return {
    x: (safeTargetWidth - width) / 2,
    y: (safeTargetHeight - height) / 2,
    width,
    height
  };
}

/** Background options for an output-resolution render. */
export interface RenderOutputOptions {
  readonly transparent: boolean;
  readonly background: string;
}

/**
 * Convert a virtual-resolution ImageData into an output-resolution canvas.
 *
 * The virtual aspect is preserved. If the output dimensions use a different
 * aspect, the remaining area is letterboxed with the render background or left
 * transparent, never stretched.
 */
export function upscaleRenderImage(
  image: ImageData,
  width: number,
  height: number,
  upscale: RenderUpscale,
  options: RenderOutputOptions = {
    transparent: false,
    background: '#121214'
  }
): HTMLCanvasElement {
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  source.getContext('2d')?.putImageData(image, 0, 0);

  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.min(8192, Math.round(width)));
  output.height = Math.max(1, Math.min(8192, Math.round(height)));
  const context = output.getContext('2d');
  if (context) {
    context.imageSmoothingEnabled = upscale === 'smooth';
    context.clearRect(0, 0, output.width, output.height);
    if (!options.transparent) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, output.width, output.height);
    }
    const fitted = fitRect(
      image.width,
      image.height,
      output.width,
      output.height
    );
    context.drawImage(
      source,
      fitted.x,
      fitted.y,
      fitted.width,
      fitted.height
    );
  }
  return output;
}

/** Encode a canvas as a PNG byte array. */
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) {
    throw new Error('The rendered image could not be encoded.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}


/** Encode a canvas as a JPEG byte array for native video streaming. */
export async function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  if (!blob) {
    throw new Error('The rendered image could not be encoded as JPEG.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}
