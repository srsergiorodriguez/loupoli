import { describe, expect, it } from 'vitest';
import {
  MAX_SHADOW_SOFTNESS,
  clampShadowSoftness,
  shadowRadiusForSoftness,
  shadowSoftnessFromRadius
} from './shadowSettings';

describe('shadow softness range', () => {
  it('supports the widened 0–2 range', () => {
    expect(MAX_SHADOW_SOFTNESS).toBe(2);
    expect(clampShadowSoftness(-1)).toBe(0);
    expect(clampShadowSoftness(3)).toBe(2);
    expect(clampShadowSoftness(Number.NaN)).toBe(0);
  });

  it('round-trips radius and softness', () => {
    expect(shadowRadiusForSoftness(0)).toBe(1);
    expect(shadowRadiusForSoftness(2)).toBe(21);
    expect(shadowSoftnessFromRadius(21)).toBe(2);
    expect(shadowSoftnessFromRadius(shadowRadiusForSoftness(1.25))).toBeCloseTo(
      1.25
    );
  });
});
