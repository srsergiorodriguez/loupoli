import { describe, expect, it } from 'vitest';
import { StrokeSampler } from './StrokeSampler';

function sampler(): StrokeSampler {
  return new StrokeSampler({
    radius: 10,
    spacing: 0.25,
    smoothing: 0,
    noise: 0,
    random: () => 0.5
  });
}

describe('StrokeSampler', () => {
  it('spaces dabs by the pressure-adjusted diameter', () => {
    const full = sampler();
    const fullDabs = [
      ...full.begin({ x: 0, y: 0, pressure: 1 }),
      ...full.add({ x: 100, y: 0, pressure: 1 })
    ];
    const light = sampler();
    const lightDabs = [
      ...light.begin({ x: 0, y: 0, pressure: 0.1 }),
      ...light.add({ x: 100, y: 0, pressure: 0.1 })
    ];
    expect(fullDabs.length).toBeGreaterThan(10);
    expect(lightDabs.length).toBeGreaterThan(fullDabs.length);
  });

  it('interpolates pressure along a segment', () => {
    const stroke = sampler();
    stroke.begin({ x: 0, y: 0, pressure: 1 });
    const dabs = stroke.add({ x: 100, y: 0, pressure: 0.2 });
    const first = dabs[0];
    const last = dabs[dabs.length - 1];
    expect(first.radius).toBeGreaterThan(last.radius);
    const middle = dabs[Math.floor(dabs.length / 2)];
    expect(middle.radius).toBeLessThan(first.radius);
    expect(middle.radius).toBeGreaterThan(last.radius);
  });

  it('resets distance carry at a surface miss', () => {
    const stroke = sampler();
    stroke.begin({ x: 0, y: 0, pressure: 1 });
    stroke.add({ x: 100, y: 0, pressure: 1 });
    const reset = stroke.reset({ x: 200, y: 200, pressure: 0.5 });
    expect(reset).toHaveLength(1);
    expect(reset[0]?.x).toBe(200);
    expect(reset[0]?.y).toBe(200);
  });
});
