import { describe, expect, it } from 'vitest';
import { planAudioExport } from './audioExport';

const placement = {
  assetId: 'audio-1',
  startFrame: 10,
  trimStart: 0.25,
  trimEnd: 3.25,
  gain: 0.8,
  muted: false
};

describe('audio export planning', () => {
  it('delays audio that starts inside the rendered range', () => {
    const plan = planAudioExport(placement, 0, 48, 24);
    expect(plan?.delay).toBeCloseTo(10 / 24);
    expect(plan?.offset).toBeCloseTo(0.25);
    expect(plan?.duration).toBeCloseTo(39 / 24);
    expect(plan?.gain).toBe(0.8);
  });

  it('trims audio that began before the rendered range', () => {
    const plan = planAudioExport(placement, 22, 92, 24);
    expect(plan?.delay).toBe(0);
    expect(plan?.offset).toBeCloseTo(0.75);
    expect(plan?.duration).toBeCloseTo(2.5);
  });

  it('rejects muted and out-of-range placements', () => {
    expect(planAudioExport({ ...placement, muted: true }, 0, 48, 24)).toBeNull();
    expect(planAudioExport(placement, 200, 220, 24)).toBeNull();
  });
});
