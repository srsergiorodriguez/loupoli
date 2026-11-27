import { describe, expect, it } from 'vitest';
import { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import { createCubeMesh } from '../geometry/primitives';
import {
  applyUvView,
  canvasDeltaToUv,
  computeUvProjection,
  fitUvProjection,
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

  it('can fit the texture unit square instead of only the UV bounds', () => {
    const mesh = HalfEdgeMesh.fromPolygons([
      {
        corners: [
          { position: [0, 0, 0], uv: [0.2, 0.2] },
          { position: [1, 0, 0], uv: [0.8, 0.2] },
          { position: [1, 1, 0], uv: [0.8, 0.8] },
          { position: [0, 1, 0], uv: [0.2, 0.8] }
        ]
      }
    ]);
    const boundsOnly = fitUvProjection(mesh, 400, 400, 0);
    const withSquare = fitUvProjection(mesh, 400, 400, 0, true);
    expect(boundsOnly.scale).toBeGreaterThan(withSquare.scale);
    expect(withSquare.scale).toBeCloseTo(400, 5);
    expect(withSquare.offsetX).toBeCloseTo(0, 5);
    expect(withSquare.offsetY).toBeCloseTo(0, 5);
    expect(uvToCanvas([0, 0], withSquare)).toEqual({ x: 0, y: 400 });
    expect(uvToCanvas([1, 1], withSquare)).toEqual({ x: 400, y: 0 });
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

  it('keeps the cached fit stable while the UV layout changes', () => {
    const mesh = createCubeMesh(1);
    const base = fitUvProjection(mesh, 400, 320, 24);
    const view = { zoom: 1.5, panX: 12, panY: -8 };
    const first = applyUvView(base, view);
    mesh.setCornerUv(0, [0.1, 0.1]);
    const second = applyUvView(base, view);
    expect(second.scale).toBe(first.scale);
    expect(second.offsetX).toBe(first.offsetX);
    expect(second.offsetY).toBe(first.offsetY);
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
