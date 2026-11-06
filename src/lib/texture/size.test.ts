import { describe, expect, it } from 'vitest';
import {
  MAX_TEXTURE_DIMENSION,
  MAX_TEXTURE_PIXELS,
  bakeAtlasTargetSize,
  textureSizeError
} from './size';

describe('texture size policy', () => {
  it('accepts arbitrary rectangular sizes within the limit', () => {
    expect(textureSizeError(37, 941)).toBeNull();
    expect(textureSizeError(4096, 4096)).toBeNull();
    expect(textureSizeError(MAX_TEXTURE_DIMENSION + 1, 1)).not.toBeNull();
    expect(textureSizeError(4096, 4097)).not.toBeNull();
    expect(textureSizeError(MAX_TEXTURE_DIMENSION, 4096)).toBeNull();
    expect(textureSizeError(1, MAX_TEXTURE_DIMENSION)).toBeNull();
    expect(textureSizeError(0, 1)).not.toBeNull();
  });

  it('doubles bake targets without forcing a square atlas', () => {
    expect(bakeAtlasTargetSize(512, 256)).toEqual({ width: 1024, height: 512 });
    expect(bakeAtlasTargetSize(320, 240)).toEqual({ width: 640, height: 480 });
  });

  it('caps extreme targets while preserving the pixel budget', () => {
    const target = bakeAtlasTargetSize(4096, 2048);
    expect(target.width).toBeLessThanOrEqual(MAX_TEXTURE_DIMENSION);
    expect(target.height).toBeLessThanOrEqual(MAX_TEXTURE_DIMENSION);
    expect(target.width * target.height).toBeLessThanOrEqual(MAX_TEXTURE_PIXELS);
    expect(target.width / target.height).toBeCloseTo(2, 1);
  });
});
