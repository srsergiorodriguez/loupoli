import { describe, expect, it } from 'vitest';
import { scrubNumber } from './numberScrub';

describe('numeric drag scrub', () => {
  it('moves at half a step per pixel', () => {
    expect(scrubNumber(1, 10, 0.1)).toBeCloseTo(1.5);
    expect(scrubNumber(0, -8, 1)).toBe(-4);
  });

  it('adds fine adjustment and clamps bounds', () => {
    expect(scrubNumber(2, 20, 0.1, true)).toBeCloseTo(2.1);
    expect(scrubNumber(0, -400, 1, false, 0, 10)).toBe(0);
    expect(scrubNumber(0, 400, 1, false, 0, 10)).toBe(10);
  });
});
