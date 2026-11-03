import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import {
  canvasDeltaToUv,
  computeUvProjection,
  pickUvCorner,
  uvClickMoved,
  uvSideSplitForPointer,
  uvToCanvas
} from './uvView';

describe('UV view math', () => {
  it('fits the UV bounds into the canvas with padding', () => {
    const mesh = createCubeMesh(1);
    const projection = computeUvProjection(mesh, 400, 320, 24);
    for (let corner = 0; corner < mesh.halfEdgeCount; corner += 1) {
      const point = uvToCanvas(mesh.getCornerUv(corner), projection);
      expect(point.x).toBeGreaterThanOrEqual(23);
      expect(point.x).toBeLessThanOrEqual(377);
      expect(point.y).toBeGreaterThanOrEqual(23);
      expect(point.y).toBeLessThanOrEqual(297);
    }
  });

  it('picks a corner within 16 CSS px and rejects distant points', () => {
    const mesh = createCubeMesh(1);
    const projection = computeUvProjection(mesh, 400, 320, 24);
    const uv = mesh.getCornerUv(0);
    const point = uvToCanvas(uv, projection);
    const hit = pickUvCorner(mesh, point.x + 5, point.y - 4, projection);
    expect(hit).not.toBeNull();
    expect(mesh.getCornerUv(hit as number)[0]).toBeCloseTo(uv[0]);
    expect(mesh.getCornerUv(hit as number)[1]).toBeCloseTo(uv[1]);
    expect(pickUvCorner(mesh, point.x + 40, point.y + 40, projection)).toBeNull();
  });

  it('applies zoom and pan after fitting', () => {
    const mesh = createCubeMesh(1);
    const base = computeUvProjection(mesh, 400, 320, 24);
    const view = computeUvProjection(mesh, 400, 320, 24, {
      zoom: 2,
      panX: 30,
      panY: -12
    });
    expect(view.scale).toBeCloseTo(base.scale * 2);
    expect(view.offsetX).toBeCloseTo(base.offsetX + 30);
    expect(view.offsetY).toBeCloseTo(base.offsetY - 12);
  });

  it('computes side split and click/drag thresholds from the pane edge', () => {
    expect(uvSideSplitForPointer(1000, 12, 500, 1000)).toBeCloseTo(0.488);
    expect(uvSideSplitForPointer(1000, 12, 500, 0)).toBe(0.38);
    expect(uvClickMoved(10, 10, 12, 12)).toBe(false);
    expect(uvClickMoved(10, 10, 20, 10)).toBe(true);
  });

  it('converts pixel deltas back into UV units', () => {
    const projection = { scale: 200, offsetX: 0, offsetY: 0, width: 400, height: 400 };
    expect(canvasDeltaToUv(100, -50, projection)).toEqual([0.5, 0.25]);
  });
});
