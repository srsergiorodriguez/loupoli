import type { RenderUpscale } from './renderSettings';

/** Convert a virtual-resolution ImageData into an output-resolution canvas. */
export function upscaleRenderImage(
  image: ImageData,
  width: number,
  height: number,
  upscale: RenderUpscale
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
    context.drawImage(source, 0, 0, output.width, output.height);
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
