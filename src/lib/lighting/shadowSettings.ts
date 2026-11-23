/** Maximum user-facing shadow softness. */
export const MAX_SHADOW_SOFTNESS = 2;

/** Minimum shadow-filter radius in shadow-map texels. */
export const SHADOW_RADIUS_MIN = 1;

/** Additional filter radius per unit of softness. */
export const SHADOW_RADIUS_PER_SOFTNESS = 10;

/** Clamp a serialized or edited softness value into the supported range. */
export function clampShadowSoftness(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_SHADOW_SOFTNESS, value));
}

/** Convert user softness into Three.js's shadow radius (texels). */
export function shadowRadiusForSoftness(softness: number): number {
  return SHADOW_RADIUS_MIN +
    clampShadowSoftness(softness) * SHADOW_RADIUS_PER_SOFTNESS;
}

/** Recover softness from a Three.js shadow radius. */
export function shadowSoftnessFromRadius(radius: number): number {
  return clampShadowSoftness(
    (radius - SHADOW_RADIUS_MIN) / SHADOW_RADIUS_PER_SOFTNESS
  );
}
