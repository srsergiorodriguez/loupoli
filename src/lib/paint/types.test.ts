import { describe, expect, it } from 'vitest';
import { paintPressure } from './types';

describe('paint pressure policy', () => {
  it('uses full pressure for mouse and touch', () => {
    expect(paintPressure('mouse', 0)).toBe(1);
    expect(paintPressure('touch', 0.2)).toBe(1);
  });

  it('normalizes pen pressure for both paint surfaces', () => {
    expect(paintPressure('pen', 0)).toBe(0.5);
    expect(paintPressure('pen', 0.01)).toBe(0.1);
    expect(paintPressure('pen', 0.5)).toBe(0.5);
    expect(paintPressure('pen', 1.4)).toBe(1);
  });
});
