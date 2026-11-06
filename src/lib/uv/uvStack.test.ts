import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import { buildUvTopology } from './uvElements';
import {
  alignUvChart,
  copyUvChart,
  sameUvTopology,
  uvChartSignature
} from './uvStack';

const mesh = createCubeMesh(2);
const topology = buildUvTopology(mesh);

describe('UV chart stacking', () => {
  it('matches a chart against itself and rejects missing charts', () => {
    expect(sameUvTopology(topology, 0, 0)).toBe(true);
    expect(sameUvTopology(topology, 0, 99)).toBe(false);
    const signature = uvChartSignature(topology, 0);
    expect(signature?.vertices).toBe(8);
    expect(signature?.edges).toBe(4);
    expect(signature?.faces).toBe(6);
  });

  it('copies exact reference UV coordinates onto another chart', () => {
    const split = createCubeMesh(2);
    for (let edge = 0; edge < split.edgeCount; edge += 1) {
      split.setEdgeSeam(edge, true);
    }
    for (let face = 0; face < split.faceCount; face += 1) {
      const start = split.faceHalfEdge[face];
      let corner = start;
      let index = 0;
      do {
        split.setCornerUv(corner, [
          face * 0.2 + (index === 1 || index === 2 ? 0.08 : 0),
          index >= 2 ? 0.08 : 0
        ]);
        index += 1;
        corner = split.heNext[corner];
      } while (corner !== start);
    }
    const splitTopology = buildUvTopology(split);
    expect(splitTopology.charts).toHaveLength(6);
    const reference = splitTopology.chartCorners[0].map((corner) =>
      split.getCornerUv(corner)
    );
    const alignment = copyUvChart(split, splitTopology, 0, 1);
    expect(alignment).not.toBeNull();
    expect(alignment?.after).toEqual(reference);
  });

  it('stacks a reflected chart with a mirrored correspondence', () => {
    const split = createCubeMesh(2);
    for (let edge = 0; edge < split.edgeCount; edge += 1) {
      split.setEdgeSeam(edge, true);
    }
    for (let face = 0; face < split.faceCount; face += 1) {
      const start = split.faceHalfEdge[face];
      let corner = start;
      let index = 0;
      do {
        split.setCornerUv(corner, [
          face * 0.2 + (index === 1 || index === 2 ? 0.08 : 0.02),
          index >= 2 ? 0.1 : 0.02
        ]);
        index += 1;
        corner = split.heNext[corner];
      } while (corner !== start);
    }
    const splitTopology = buildUvTopology(split);
    const referenceCorners = splitTopology.chartCorners[0];
    const movingCorners = splitTopology.chartCorners[1];
    const referenceUvs = referenceCorners.map((corner) =>
      split.getCornerUv(corner)
    );
    movingCorners.forEach((corner, index) => {
      const reference = referenceUvs[index];
      split.setCornerUv(corner, [1 - reference[0], reference[1]]);
    });
    const mirrored = copyUvChart(split, splitTopology, 0, 1, 'mirror');
    expect(mirrored).not.toBeNull();
    expect(mirrored?.after).toEqual(referenceUvs);
  });

  it('aligns a chart onto itself without changing UVs', () => {
    const alignment = alignUvChart(mesh, topology, 0, 0);
    expect(alignment).not.toBeNull();
    expect(alignment?.after).toEqual(alignment?.before);
    const copied = copyUvChart(mesh, topology, 0, 0);
    expect(copied?.after).toEqual(copied?.before);
  });
});
