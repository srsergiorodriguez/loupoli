/** Document-level ambient-occlusion bake settings. */
export interface AmbientOcclusionSettings {
  readonly enabled: boolean;
  /** 0–1 darkening strength. */
  readonly strength: number;
  /** Maximum world-space ray distance. */
  readonly distance: number;
  /** Normal offset used to avoid self-intersection. */
  readonly bias: number;
  /** Hemisphere rays per baked texel. */
  readonly samples: number;
}

/** Neutral defaults; AO is opt-in and does not change existing bakes. */
export const DEFAULT_AMBIENT_OCCLUSION: AmbientOcclusionSettings = {
  enabled: false,
  strength: 0.5,
  distance: 1,
  bias: 0.01,
  samples: 8
};

/** Clamp serialized AO settings to the supported UI ranges. */
export function normalizeAmbientOcclusion(
  value: Partial<AmbientOcclusionSettings>
): AmbientOcclusionSettings {
  return {
    enabled: value.enabled === true,
    strength: Math.max(0, Math.min(1, value.strength ?? 0.5)),
    distance: Math.max(0.01, Math.min(20, value.distance ?? 1)),
    bias: Math.max(0, Math.min(0.2, value.bias ?? 0.01)),
    samples: Math.max(4, Math.min(32, Math.round(value.samples ?? 8)))
  };
}
