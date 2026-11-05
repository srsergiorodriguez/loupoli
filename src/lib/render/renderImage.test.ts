import { describe, expect, it } from 'vitest';
import { fitRect } from './renderImage';

describe('render output fitting', () => {
  it('keeps the virtual aspect inside a matching output', () => {
    expect(fitRect(320, 180, 1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720
    });
  });

  it('letterboxes a wide virtual frame into a square output', () => {
    const fitted = fitRect(320, 180, 640, 640);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(140);
    expect(fitted.width).toBe(640);
    expect(fitted.height).toBe(360);
  });

  it('pillarboxes a wide virtual frame into a taller output', () => {
    const fitted = fitRect(320, 180, 320, 480);
    expect(fitted.x).toBe(0);
    expect(fitted.y).toBe(150);
    expect(fitted.width).toBe(320);
    expect(fitted.height).toBe(180);
  });
});
