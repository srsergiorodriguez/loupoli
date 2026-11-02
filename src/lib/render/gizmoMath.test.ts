import { describe, expect, it } from 'vitest';
import { Plane, Quaternion, Ray, Vector3 } from 'three';
import {
  angleAroundAxis,
  closestAxisParameter,
  intersectGizmoPlane,
  planeBasis,
  shortestAngleDelta,
  snapScalar,
  worldAxis
} from './gizmoMath';

describe('gizmo math', () => {
  it('rotates local axes into object space', () => {
    const quaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2
    );
    const x = worldAxis('x', quaternion);
    expect(x.x).toBeCloseTo(0);
    expect(x.y).toBeCloseTo(1);
    expect(x.z).toBeCloseTo(0);
  });

  it('finds the closest parameter on an axis to a pointer ray', () => {
    const ray = new Ray(new Vector3(2, 0.5, 0), new Vector3(0, 0, -1));
    const parameter = closestAxisParameter(
      ray,
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0)
    );
    expect(parameter).toBeCloseTo(2);
    expect(
      closestAxisParameter(
        new Ray(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0)
      )
    ).toBeNull();
  });

  it('intersects a plane and computes a stable angle delta', () => {
    const ray = new Ray(new Vector3(1, 0, 1), new Vector3(0, 0, -1));
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    const hit = intersectGizmoPlane(ray, plane);
    expect(hit).not.toBeNull();
    const basis = planeBasis(new Vector3(0, 0, 1));
    expect(angleAroundAxis(hit!, new Vector3(0, 0, 0), basis)).toBeCloseTo(0);
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(snapScalar(0.62, 0.25)).toBe(0.5);
    expect(snapScalar(-0.62, 0.25)).toBe(-0.5);
    expect(snapScalar(1.13, 0.5)).toBe(1);
    expect(snapScalar(2.3, 0)).toBe(2.3);
  });
});
