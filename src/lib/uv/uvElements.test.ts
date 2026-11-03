import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import { buildUvTopology, pickUvElement } from './uvElements';
import { computeUvProjection } from './uvView';

const mesh = createCubeMesh(2);
const topology = buildUvTopology(mesh);
const projection = computeUvProjection(mesh, 400, 400);

describe('UV element topology', () => {
  it('derives one chart, eight vertices, twelve edges, and six faces', () => {
    expect(topology.charts).toHaveLength(1);
    expect(topology.vertices).toHaveLength(8);
    expect(topology.edges).toHaveLength(12);
    expect(topology.faces).toHaveLength(6);
    expect(topology.chartCorners[0]).toHaveLength(24);
  });

  it('selects a face by containment and an island through that face', () => {
    const face = topology.faces[0];
    const points = face.corners.map((corner) =>
      mesh.getCornerUv(corner)
    );
    const center = points.reduce(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1]],
      [0, 0]
    ).map((value) => value / points.length) as [number, number];
    const screen = {
      x: projection.offsetX + center[0] * projection.scale,
      y: projection.height - projection.offsetY - center[1] * projection.scale
    };
    const hit = pickUvElement(
      mesh,
      topology,
      'face',
      screen.x,
      screen.y,
      projection
    );
    expect(hit?.kind).toBe('face');
    expect(hit?.corners.length).toBeGreaterThanOrEqual(3);
    const island = pickUvElement(
      mesh,
      topology,
      'island',
      screen.x,
      screen.y,
      projection
    );
    expect(island?.corners).toHaveLength(24);
  });
});
