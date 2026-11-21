import type { ShadingMode } from './types';

/**
 * Whether a shading path can display PS1 effects.
 *
 * PS1 snapping and affine UVs live in the unlit shader; Solid, Lit, and
 * Wireframe bypass it. The single PS1 toggle must therefore leave the look
 * only while one of the texture paths is active.
 */
export function isPs1ShadingMode(mode: ShadingMode): boolean {
  return mode === 'unlit' || mode === 'texture-wire';
}
