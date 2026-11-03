import { describe, expect, it } from 'vitest';
import type { UvProjection } from './uvView';
import { brushTextureRadius, uvCanvasToTexture } from './uvPaint';

const projection: UvProjection = {
  scale: 200,
  offsetX: 50,
  offsetY: 30,
  width: 400,
  height: 300
};

describe('UV paint mapping', () => {
  it('maps canvas pixels to flipped texture pixels', () => {
    expect(uvCanvasToTexture(50, 270, projection, 1024, 512)).toEqual([
      0,
      512
    ]);
    expect(uvCanvasToTexture(250, 70, projection, 1024, 512)).toEqual([
      1024,
      0
    ]);
  });

  it('converts brush size through the UV scale', () => {
    expect(brushTextureRadius(20, projection, 1000)).toBeCloseTo(50);
    expect(brushTextureRadius(0, projection, 1000)).toBeGreaterThanOrEqual(0.5);
  });
});
