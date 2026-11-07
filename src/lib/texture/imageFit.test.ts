import { describe, expect, it } from 'vitest';
import { imageFitRect } from './imageFit';

describe('image fit', () => {
  it('contains a landscape image with centered margins', () => {
    expect(
      imageFitRect(200, 100, 128, 128, { mode: 'contain' })
    ).toEqual({ x: 0, y: 32, width: 128, height: 64 });
  });

  it('covers by cropping the long axis', () => {
    expect(
      imageFitRect(200, 100, 128, 128, { mode: 'cover' })
    ).toEqual({ x: -64, y: 0, width: 256, height: 128 });
  });

  it('stretches and preserves native pixels', () => {
    expect(
      imageFitRect(200, 100, 128, 128, { mode: 'stretch' })
    ).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    expect(
      imageFitRect(64, 32, 128, 128, { mode: 'native', anchorX: 0, anchorY: 0 })
    ).toEqual({ x: 0, y: 0, width: 64, height: 32 });
  });
});
