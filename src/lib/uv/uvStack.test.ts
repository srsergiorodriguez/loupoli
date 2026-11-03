import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import { buildUvTopology } from './uvElements';
import { alignUvChart, sameUvTopology, uvChartSignature } from './uvStack';

const mesh = createCubeMesh(2);
const topology = buildUvTopology(mesh);

describe('UV chart stacking', () => {
  it('matches a chart against itself and rejects missing charts', () => {
    expect(sameUvTopology(topology, 0, 0)).toBe(true);
    expect(sameUvTopology(topology, 0, 99)).toBe(false);
    const signature = uvChartSignature(topology, 0);
    expect(signature?.vertices).toBe(8);
    expect(signature?.edges).toBe(12);
    expect(signature?.faces).toBe(6);
  });

  it('aligns a chart onto itself without changing UVs', () => {
    const alignment = alignUvChart(mesh, topology, 0, 0);
    expect(alignment).not.toBeNull();
    expect(alignment?.after).toEqual(alignment?.before);
  });
});
