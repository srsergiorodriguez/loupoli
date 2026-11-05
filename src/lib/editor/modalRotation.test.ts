import { describe, expect, it } from 'vitest';
import { screenRotationDegrees } from './modalRotation';

describe('screen rotation around a pivot', () => {
  it('turns counterclockwise when moving up from the right', () => {
    expect(screenRotationDegrees(0, 0, 100, 0, 0, -100)).toBeCloseTo(90);
  });

  it('turns clockwise when moving down from the right', () => {
    expect(screenRotationDegrees(0, 0, 100, 0, 0, 100)).toBeCloseTo(-90);
  });

  it('wraps across the screen angle boundary', () => {
    const angle = screenRotationDegrees(0, 0, -100, 0, 0, -100);
    expect(angle).not.toBeNull();
    expect(angle!).toBeLessThan(0);
  });

  it('has no angle when the drag starts on the pivot', () => {
    expect(screenRotationDegrees(0, 0, 1, 1, 50, 50)).toBeNull();
  });
});
