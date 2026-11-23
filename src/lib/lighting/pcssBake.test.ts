import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BakePcssShadowMap } from './pcssBake';

function floor(): Float32Array {
  return new Float32Array([
    -4, -4, 0, 4, -4, 0, 4, 4, 0,
    -4, -4, 0, 4, 4, 0, -4, 4, 0
  ]);
}

function blocker(): Float32Array {
  return new Float32Array([
    -1, -1, 1, 1, -1, 1, 1, 1, 1,
    -1, -1, 1, 1, 1, 1, -1, 1, 1
  ]);
}

describe('CPU PCSS shadow map', () => {
  it('shadows below a blocker and leaves open floor lit', () => {
    const map = new BakePcssShadowMap(
      new Vector3(0, 0, -1),
      [floor(), blocker()],
      1
    );
    const normal = new Vector3(0, 0, 1);
    expect(map.visibility(new Vector3(0, 0, 0), normal)).toBeLessThan(0.99);
    expect(map.visibility(new Vector3(3.5, 3.5, 0), normal)).toBeCloseTo(1);
  });

  it('supports the full two-unit softness range', () => {
    const map = new BakePcssShadowMap(
      new Vector3(0, 0, -1),
      [floor(), blocker()],
      2
    );
    const normal = new Vector3(0, 0, 1);
    const visibility = map.visibility(new Vector3(0, 0, 0), normal);
    expect(visibility).toBeGreaterThanOrEqual(0);
    expect(visibility).toBeLessThanOrEqual(1);
  });
});
