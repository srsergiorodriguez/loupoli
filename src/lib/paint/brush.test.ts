import { describe, expect, it } from 'vitest';
import { drawStampLine, rgbaColor } from './brush';
import type { PaintSettings } from './types';

describe('paint color alpha', () => {
  it('converts a hex color and alpha to canvas CSS', () => {
    expect(rgbaColor('#ff8000', 0.5)).toBe('rgba(255,128,0,0.5)');
  });

  it('clamps alpha to the supported range', () => {
    expect(rgbaColor('#ffffff', 2)).toBe('rgba(255,255,255,1)');
    expect(rgbaColor('#ffffff', -1)).toBe('rgba(255,255,255,0)');
  });
});


describe('pressure-aware stamp spacing', () => {
  function paintSettings(spacing: number): PaintSettings {
    return {
      tool: 'brush',
      color: '#ffffff',
      colorAlpha: 1,
      secondaryColor: '#000000',
      secondaryColorAlpha: 1,
      radius: 10,
      opacity: 1,
      hardness: 1,
      smoothing: 0,
      noise: 0,
      spacing,
      shapeFilled: true,
      gradient: 'linear'
    };
  }

  it('keeps light-pressure stamp density bounded', () => {
    let arcs = 0;
    const context = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {
        arcs += 1;
      },
      fill: () => {},
      fillStyle: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over'
    } as unknown as CanvasRenderingContext2D;
    drawStampLine(
      context,
      0,
      0,
      100,
      0,
      10,
      paintSettings(0.25),
      0.1,
      () => 0.5
    );
    const light = arcs;
    arcs = 0;
    drawStampLine(
      context,
      0,
      0,
      100,
      0,
      10,
      paintSettings(0.25),
      1,
      () => 0.5
    );
    const full = arcs;
    expect(light).toBeGreaterThan(full);
    expect(light).toBeLessThanOrEqual(Math.ceil(full * 1.6));
  });
});
