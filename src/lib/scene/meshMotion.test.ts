import { describe, expect, it } from 'vitest';
import { MeshMotionTrack } from './SceneAnimation';
import { createCubeMesh } from '../geometry/primitives';
import { MeshNode } from './MeshNode';

describe('mesh motion', () => {
  it('stores a pose delta and evaluates it on the node without changing base', () => {
    const base = createCubeMesh(1);
    const node = new MeshNode(base, 'cube', 'Cube', 'node-1');
    const original = base.getVertexPosition(0);
    const track = new MeshMotionTrack('node-1', 'mesh-track-1');
    const posed = base.positions.slice();
    posed[0] += 0.5;
    expect(
      track.setPoseKey(0, base.positions, posed, 'linear')
    ).toBe(true);
    expect(track.vertexIndices).toEqual([0]);
    const deltas = new Float32Array(base.positions.length);
    deltas[0] = 0.5;
    node.setMotionDeltas(deltas);
    const evaluated = node.getEvaluatedMesh().mesh;
    expect(evaluated.getVertexPosition(0)[0]).toBeCloseTo(original[0] + 0.5);
    expect(node.mesh.getVertexPosition(0)[0]).toBeCloseTo(original[0]);
    for (let face = 0; face < evaluated.faceCount; face += 1) {
      expect(() => evaluated.computeFaceNormal(face)).not.toThrow();
    }
  });

  it('expands the stable vertex set and backfills earlier poses', () => {
    const base = new Float32Array(12);
    const first = new Float32Array(12);
    first[0] = 1;
    const second = new Float32Array(12);
    second[0] = 1;
    second[4] = 2;
    const track = new MeshMotionTrack('node-1', 'mesh-track-1');
    track.setPoseKey(0, base, first);
    track.setPoseKey(10, base, second);
    expect(track.vertexIndices).toEqual([0, 1]);
    expect(Array.from(track.keyframes[0].values)).toEqual([
      1, 0, 0, 0, 0, 0
    ]);
    expect(Array.from(track.keyframes[1].values)).toEqual([
      1, 0, 0, 0, 2, 0
    ]);
  });

  it('combines shape-key targets with motion deltas additively', () => {
    const base = createCubeMesh(1);
    const node = new MeshNode(base, 'cube', 'Cube', 'node-1');
    const key = node.addShapeKey('Target');
    key.targetPositions[0] += 1;
    key.weight = 1;
    const deltas = new Float32Array(base.positions.length);
    deltas[0] = 0.5;
    node.setMotionDeltas(deltas);
    expect(node.getEvaluatedMesh().mesh.getVertexPosition(0)[0]).toBeCloseTo(
      base.getVertexPosition(0)[0] + 1.5
    );
  });

  it('blocks topology replacement while motion is tracked', () => {
    const node = new MeshNode(createCubeMesh(1), 'cube', 'Cube', 'node-1');
    node.motionTracked = true;
    expect(() => node.setMesh(createCubeMesh(1))).toThrow(
      'Remove Mesh Motion tracks'
    );
  });

  it('interpolates and steps between full poses', () => {
    const track = new MeshMotionTrack('node-1', 'mesh-track-1');
    const base = new Float32Array(9);
    const first = new Float32Array(9);
    first[0] = 2;
    first[4] = 4;
    const second = new Float32Array(9);
    second[0] = 4;
    second[4] = 8;
    track.setPoseKey(0, base, first, 'linear');
    track.setPoseKey(10, base, second, 'linear');
    expect(track.evaluate(5)?.slice(0, 6)).toEqual(
      new Float32Array([3, 0, 0, 0, 6, 0])
    );
    track.setPoseKey(0, base, first, 'step');
    expect(track.evaluate(5)?.slice(0, 6)).toEqual(
      new Float32Array([2, 0, 0, 0, 4, 0])
    );
  });
});
