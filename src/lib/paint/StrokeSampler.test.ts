import { describe, expect, it } from 'vitest';
import { StrokeSampler, type StrokeSamplerSettings } from './StrokeSampler';

function sampler(
  overrides: Partial<StrokeSamplerSettings> = {}
): StrokeSampler {
  return new StrokeSampler({
    radius: 10,
    spacing: 0.25,
    smoothing: 0,
    noise: 0,
    pressureOpacity: false,
    pressureCurve: 1,
    pressureMin: 0.35,
    tiltEnabled: true,
    taperIn: 0,
    random: () => 0.5,
    ...overrides
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

  it('responds to the pressure curve and minimum size', () => {
    const soft = sampler({ pressureCurve: 2, pressureMin: 0.2 });
    const firm = sampler({ pressureCurve: 0.6, pressureMin: 0.6 });
    const softDab = soft.begin({ x: 0, y: 0, pressure: 0.5 })[0];
    const firmDab = firm.begin({ x: 0, y: 0, pressure: 0.5 })[0];
    expect(softDab.radius).toBeLessThan(firmDab.radius);
  });

  it('uses tilt only when tilt shaping is enabled', () => {
    const sample = { x: 0, y: 0, pressure: 0.5, tiltX: 55, tiltY: 20 };
    const tilted = sampler({ tiltEnabled: true }).begin(sample)[0];
    const circular = sampler({ tiltEnabled: false }).begin(sample)[0];
    expect(tilted.aspect).toBeLessThan(0.9);
    expect(circular.aspect).toBe(1);
  });

  it('ramps the stroke radius in over the taper distance', () => {
    const stroke = sampler({ taperIn: 20, spacing: 0.25 });
    const first = stroke.begin({ x: 0, y: 0, pressure: 1 })[0];
    const later = stroke.add({ x: 100, y: 0, pressure: 1 });
    expect(first.radius).toBeLessThan(4);
    expect(later[later.length - 1]?.radius).toBeGreaterThan(9);
  });
