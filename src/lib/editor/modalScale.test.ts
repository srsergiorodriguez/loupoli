import { describe, expect, it } from 'vitest';
import { screenScaleFactor } from './modalScale';

describe('screen scale around a pivot', () => {
  it('scales up when moving away from the pivot', () => {
    expect(screenScaleFactor(0, 0, 100, 0, 200, 0)).toBeCloseTo(2);
  });

  it('scales down when moving toward the pivot', () => {
    expect(screenScaleFactor(0, 0, 100, 0, 50, 0)).toBeCloseTo(0.5);
  });

  it('does not change scale when moving around the pivot at one radius', () => {
    expect(screenScaleFactor(0, 0, 100, 0, 0, -100)).toBeCloseTo(1);
  });

  it('clamps at the pivot instead of becoming zero', () => {
    expect(screenScaleFactor(0, 0, 100, 0, 0, 0)).toBe(0.001);
  });

  it('has no factor when the drag starts on the pivot', () => {
    expect(screenScaleFactor(0, 0, 2, 2, 100, 100)).toBeNull();
  });
});
