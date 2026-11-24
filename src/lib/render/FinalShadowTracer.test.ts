import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { FinalShadowTracer, type FinalShadowLight } from './FinalShadowTracer';

function floorAndOccluder(): Float32Array {
  return new Float32Array([
    // Floor, two triangles around the origin at z = 0.
    -10, -10, 0, 10, -10, 0, 10, 10, 0,
    -10, -10, 0, 10, 10, 0, -10, 10, 0,
    // Floating occluder above the floor.
    -2, -2, 2, 2, -2, 2, 2, 2, 2,
    -2, -2, 2, 2, 2, 2, -2, 2, 2
  ]);
}

describe('final shadow tracer', () => {
  it('finds a shadowed floor hit and lit floor hits', () => {
    const tracer = new FinalShadowTracer();
    tracer.setTriangles(floorAndOccluder());
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(5, -5, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    tracer.computeHits(camera, 32, 32);
    const light: FinalShadowLight = {
      id: 'sun',
      kind: 'directional',
      direction: new Vector3(0.4, 0, -1).normalize(),
      position: new Vector3(0, 0, 5),
      softness: 0,
      castShadow: true
    };
    const mask = tracer.maskFor(light, 1);
    expect(mask.some((value) => value === 0)).toBe(true);
    expect(mask.some((value) => value === 255)).toBe(true);
  });

  it('returns full visibility when the light does not cast shadows', () => {
    const tracer = new FinalShadowTracer();
    tracer.setTriangles(floorAndOccluder());
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(5, -5, 5);
    camera.lookAt(0, 0, 0);
    tracer.computeHits(camera, 16, 16);
    const light: FinalShadowLight = {
      id: 'fill',
      kind: 'directional',
      direction: new Vector3(0, 0, -1),
      position: new Vector3(0, 0, 5),
      softness: 1,
      castShadow: false
    };
    const mask = tracer.maskFor(light, 1);
    expect(mask.every((value) => value === 255)).toBe(true);
  });
});
