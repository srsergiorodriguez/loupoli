import { describe, expect, it } from 'vitest';
import {
  packLightingImageData,
  unpackLightingPixels
} from './compact';

function image(
  width: number,
  height: number,
  pixels: readonly number[]
): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(pixels)
  } as ImageData;
}

describe('compact lighting snapshots', () => {
  it('packs opaque monochrome light into one channel', () => {
    const packed = packLightingImageData(
      image(2, 1, [10, 10, 10, 255, 20, 20, 20, 255])
    );
    expect(packed.channels).toBe(1);
    expect([...packed.bytes]).toEqual([10, 20]);
    expect([...unpackLightingPixels(packed)]).toEqual([
      10, 10, 10, 255, 20, 20, 20, 255
    ]);
  });

  it('keeps colored lighting as RGB', () => {
    const packed = packLightingImageData(
      image(1, 1, [255, 128, 64, 255])
    );
    expect(packed.channels).toBe(3);
    expect([...packed.bytes]).toEqual([255, 128, 64]);
  });

  it('falls back to RGBA when alpha is meaningful', () => {
    const packed = packLightingImageData(
      image(1, 1, [12, 12, 12, 128])
    );
    expect(packed.channels).toBe(4);
    expect([...unpackLightingPixels(packed)]).toEqual([12, 12, 12, 128]);
  });
});
