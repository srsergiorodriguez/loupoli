import { afterAll, describe, expect, it } from 'vitest';
import { ShaderChunk } from 'three';
import { installPcssShadowShader } from './pcss';

const original = ShaderChunk.shadowmap_pars_fragment;

afterAll(() => {
  ShaderChunk.shadowmap_pars_fragment = original;
});

describe('PCSS shadow patch', () => {
  it('installs blocker search and point tap filtering', () => {
    expect(installPcssShadowShader()).toBe(true);
    expect(ShaderChunk.shadowmap_pars_fragment).toContain('blockerSum');
    expect(ShaderChunk.shadowmap_pars_fragment).toContain('textureCube( shadowMap, direction )');
  });
});
