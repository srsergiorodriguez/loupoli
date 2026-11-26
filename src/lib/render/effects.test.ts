import { describe, expect, it } from 'vitest';
import {
  applyPostEffects,
  createRenderEffect,
  materialEffectSettings,
  normalizeRenderEffects,
  renderEffectPreset
} from './effects';

function imageOf(width: number, height: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data.set(rgba, pixel * 4);
  }
  return data;
}

describe('render effects', () => {
  it('quantizes color depth while preserving alpha', () => {
    const source = imageOf(2, 2, [137, 91, 201, 123]);
    const result = applyPostEffects(source, 2, 2, [
      createRenderEffect('color-depth', 'depth')
    ]);
    expect(result[0]).toBe(140);
    expect(result[1]).toBe(90);
    expect(result[2]).toBe(197);
    expect(result[3]).toBe(123);
  });

  it('applies deterministic ordered dithering', () => {
    const source = imageOf(4, 4, [128, 128, 128, 255]);
    const effect = {
      ...createRenderEffect('dither', 'dither'),
      pattern: 'bayer4' as const,
      depth: '1bit' as const,
      strength: 1
    };
    const first = applyPostEffects(source, 4, 4, [effect]);
    const second = applyPostEffects(source, 4, 4, [effect]);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(new Set(Array.from(first).filter((_, index) => index % 4 === 0)).size)
      .toBeGreaterThan(1);
    expect(first[3]).toBe(255);
  });

  it('builds the PS1 preset in material-then-post order', () => {
    const effects = renderEffectPreset('ps1', (kind) => kind);
    expect(effects.map((effect) => effect.kind)).toEqual([
      'vertex-snap',
      'affine-texture',
      'dither'
    ]);
    expect(materialEffectSettings(effects)).toEqual({
      snap: true,
      affine: true,
      resolution: [320, 240]
    });
  });

  it('rejects invalid persisted stacks', () => {
    expect(normalizeRenderEffects([{ id: 'x', kind: 'unknown', enabled: true }]))
      .toBeNull();
    expect(normalizeRenderEffects('nope')).toBeNull();
    expect(
      normalizeRenderEffects([
        { id: 'x', kind: 'color-depth', enabled: true, depth: 'rgb555' }
      ])
    ).not.toBeNull();
  });
});
