import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import { drawUvWireframe } from './uvCanvas';

describe('UV wireframe overlay', () => {
  it('strokes face outlines without drawing edit handles', () => {
    let strokes = 0;
    let arcs = 0;
    let fills = 0;
    const context = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      stroke() {
        strokes += 1;
      },
      arc() {
        arcs += 1;
      },
      fill() {
        fills += 1;
      }
    } as unknown as CanvasRenderingContext2D;
    const mesh = createCubeMesh(2);
    drawUvWireframe(context, mesh, (u, v) => [u * 100, (1 - v) * 100], {
      color: '#ffffff',
      seamColor: '#ffb45e',
      drawSeams: false
    });
    expect(strokes).toBe(mesh.faceCount);
    expect(arcs).toBe(0);
    expect(fills).toBe(0);
  });
});
