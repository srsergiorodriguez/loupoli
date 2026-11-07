import { describe, expect, it } from 'vitest';
import {
  applyTextureEffect,
  createTextureEffect,
  normalizeTextureEffect
} from './effects';

function pixels(...values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values);
}

describe('texture effects', () => {
  it('posterizes each channel and preserves alpha', () => {
    const data = pixels(0, 128, 255, 77, 64, 192, 10, 128);
    applyTextureEffect(data, 2, 1, createTextureEffect('posterize'));
    expect(Array.from(data)).toEqual([0, 170, 255, 77, 85, 170, 0, 128]);
  });

  it('keeps ordered dithering deterministic and alpha unchanged', () => {
    const data = pixels(10, 40, 90, 33, 120, 160, 200, 99);
    applyTextureEffect(data, 2, 1, {
      type: 'dither',
      mode: 'ordered',
      matrix: 2,
      levels: 3,
      monochrome: false
    });
    expect(data[3]).toBe(33);
    expect(data[7]).toBe(99);
    expect(Array.from(data)).toEqual([
      0, 0, 0, 33, 128, 128, 255, 99
    ]);
  });

  it('normalizes invalid effect parameters into supported bounds', () => {
    expect(normalizeTextureEffect({ type: 'tone', exposure: 99, contrast: -4, gamma: 0 })).toEqual({
      type: 'tone',
      exposure: 2,
      contrast: -1,
      gamma: 0.2
    });
    expect(normalizeTextureEffect({ type: 'dither', matrix: 7, mode: 'bad' })).toEqual({
      type: 'dither',
      mode: 'ordered',
      matrix: 4,
      levels: 4,
      monochrome: false
    });
    expect(normalizeTextureEffect({ type: 'unknown' })).toBeNull();
  });
});
