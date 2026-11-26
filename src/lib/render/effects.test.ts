import { describe, expect, it } from 'vitest';
import {
  applyPostEffects,
  createRenderEffect,
  detectRenderEffectPreset,
  hasTemporalEffects,
  materialEffectSettings,
  normalizeRenderEffects,
  RENDER_EFFECT_DEFINITIONS,
  renderEffectPreset,
  renderEffectStage
} from './effects';

function imageOf(width: number, height: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data.set(rgba, pixel * 4);
  }
  return data;
}

function gradient(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = (x / width) * 255;
      data[index + 1] = (y / height) * 255;
      data[index + 2] = 128;
      data[index + 3] = 200;
    }
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

  it('builds VHS, CRT, and Film presets with detectable stacks', () => {
    let id = 0;
    for (const preset of ['vhs', 'crt', 'film'] as const) {
      const effects = renderEffectPreset(preset, () => `id-${id++}`);
      expect(effects.length).toBeGreaterThan(2);
      expect(detectRenderEffectPreset(effects)).toBe(preset);
      const result = applyPostEffects(gradient(32, 24), 32, 24, effects, {
        frame: 3
      });
      expect(result.length).toBe(32 * 24 * 4);
      expect(Array.from(result).every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  it('runs every post effect without changing buffer shape', () => {
    for (const definition of RENDER_EFFECT_DEFINITIONS) {
      if (renderEffectStage(definition.kind) !== 'post') {
        continue;
      }
      const effect = createRenderEffect(definition.kind, definition.kind);
      const source = gradient(24, 18);
      const result = applyPostEffects(source, 24, 18, [effect], {
        frame: 2,
        previous: gradient(24, 18)
      });
      expect(result.length).toBe(source.length);
      expect(Array.from(result).every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  it('uses previous-frame history only for temporal effects', () => {
    const ghost = createRenderEffect('ghost-trails', 'ghost');
    expect(hasTemporalEffects([ghost])).toBe(true);
    expect(hasTemporalEffects([createRenderEffect('grain', 'grain')])).toBe(false);
    const current = imageOf(2, 2, [200, 40, 10, 255]);
    const previous = imageOf(2, 2, [0, 100, 220, 255]);
    const result = applyPostEffects(current, 2, 2, [ghost], { previous });
    expect(result[0]).not.toBe(200);
    expect(result[2]).not.toBe(10);
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
