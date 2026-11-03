import { describe, expect, it } from 'vitest';
import {
  paintBounds,
  paintPointToTexture,
  paintTextureRadius
} from './paintView';

describe('paint view math', () => {
  it('fits a square texture and maps canvas points to texels', () => {
    expect(paintBounds(400, 300, 24)).toEqual({ x: 74, y: 24, size: 252 });
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
