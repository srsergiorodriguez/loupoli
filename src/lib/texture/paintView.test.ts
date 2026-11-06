import { describe, expect, it } from 'vitest';
import {
  paintBounds,
  paintPointToTexture,
  paintTextureRadius
} from './paintView';

describe('paint view math', () => {
  it('fits a square texture and maps canvas points to texels', () => {
    expect(paintBounds(400, 300, 1, 1, 24)).toEqual({ x: 74, y: 24, width: 252, height: 252 });
    expect(paintPointToTexture(200, 150, 400, 300, 1024, 1024)).toEqual({
      x: 512,
      y: 512
    });
    expect(paintPointToTexture(10, 10, 400, 300, 1024, 1024)).toBeNull();
  });

  it('scales the brush from screen pixels to texture pixels', () => {
    expect(paintTextureRadius(36, 400, 400, 1024)).toBeCloseTo(
      (18 * 1024) / 352
    );
    expect(paintTextureRadius(10, 400, 400, 1024)).toBeCloseTo(
      (5 * 1024) / 352
    );
  });
});


describe('rectangular paint bounds', () => {
  it('keeps texture proportions and maps corners exactly', () => {
    const bounds = paintBounds(400, 300, 640, 360, 24);
    expect(bounds.width / bounds.height).toBeCloseTo(640 / 360, 5);
    expect(bounds.x).toBeGreaterThanOrEqual(24);
    expect(paintPointToTexture(bounds.x, bounds.y, 400, 300, 640, 360)).toEqual({
      x: 0,
      y: 0
    });
  });
});
