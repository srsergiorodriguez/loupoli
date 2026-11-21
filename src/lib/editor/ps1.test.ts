import { describe, expect, it } from 'vitest';
import { isPs1ShadingMode } from './ps1';

describe('PS1 shading paths', () => {
  it('only enables the look on texture shading paths', () => {
    expect(isPs1ShadingMode('unlit')).toBe(true);
    expect(isPs1ShadingMode('texture-wire')).toBe(true);
    expect(isPs1ShadingMode('solid')).toBe(false);
    expect(isPs1ShadingMode('lit')).toBe(false);
    expect(isPs1ShadingMode('wireframe')).toBe(false);
  });
});
