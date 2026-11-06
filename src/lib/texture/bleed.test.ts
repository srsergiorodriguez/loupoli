import { describe, expect, it } from 'vitest';
import { bleedImageData, erodeImageEdges } from './bleed';

describe('texture edge bleed', () => {
  it('copies opaque edge color into transparent padding', () => {
    const width = 5;
    const height = 5;
    const data = new Uint8ClampedArray(width * height * 4);
    const center = (2 * width + 2) * 4;
    data[center] = 200;
    data[center + 1] = 100;
    data[center + 2] = 50;
    data[center + 3] = 255;
    bleedImageData(data, width, height, 1);
    expect([...data.slice(center - 4, center - 1)]).toEqual([200, 100, 50]);
    expect(data[center - 1]).toBe(255);
    const far = (2 * width + 0) * 4;
    expect(data[far + 3]).toBe(0);
  });

  it('bleeds multiple pixels and leaves the interior unchanged', () => {
    const width = 7;
    const height = 7;
    const data = new Uint8ClampedArray(width * height * 4);
    const center = (3 * width + 3) * 4;
    data[center] = 255;
    data[center + 3] = 255;
    bleedImageData(data, width, height, 2);
    expect(data[(3 * width + 1) * 4 + 3]).toBe(255);
    expect(data[(3 * width + 0) * 4 + 3]).toBe(0);
    expect(data[center]).toBe(255);
  });
});


describe('source edge cleanup', () => {
  it('removes the outer ring before the bleed fills it', () => {
    const width = 7;
    const height = 7;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      data[pixel * 4] = 255;
      data[pixel * 4 + 1] = 255;
      data[pixel * 4 + 2] = 255;
      data[pixel * 4 + 3] = 255;
    }
    erodeImageEdges(data, width, height, 3);
    expect(data[(0 * width + 3) * 4 + 3]).toBe(0);
    expect(data[(2 * width + 2) * 4 + 3]).toBe(0);
    expect(data[(3 * width + 3) * 4 + 3]).toBe(255);
    bleedImageData(data, width, height, 4);
    expect(data[(0 * width + 3) * 4 + 3]).toBe(255);
  });
});
