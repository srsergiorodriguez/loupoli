import type { Vec2 } from '../geometry/HalfEdgeMesh';

/** Where an effect runs in the render pipeline. */
export type RenderEffectStage = 'material' | 'post';

/** Built-in render effect kinds. */
export type RenderEffectKind =
  | 'vertex-snap'
  | 'affine-texture'
  | 'color-depth'
  | 'dither';

/** Quantization target for color-depth and dither effects. */
export type ColorDepthMode = 'rgb555' | 'rgb332' | '1bit';

/** Ordered dither matrices. */
export type DitherPattern = 'bayer4' | 'bayer8';

/** One serializable render effect. Unused fields depend on the kind. */
export interface RenderEffect {
  readonly id: string;
  readonly kind: RenderEffectKind;
  readonly enabled: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly depth?: ColorDepthMode;
  readonly pattern?: DitherPattern;
  readonly strength?: number;
}

/** One built-in preset. */
export type RenderEffectPreset = 'clean' | 'ps1' | 'dither';

/** Human-readable metadata for the effect stack UI. */
export interface RenderEffectDefinition {
  readonly kind: RenderEffectKind;
  readonly label: string;
  readonly stage: RenderEffectStage;
  readonly description: string;
}

/** Registry for effect creation and Inspector labels. */
export const RENDER_EFFECT_DEFINITIONS: readonly RenderEffectDefinition[] = [
  {
    kind: 'vertex-snap',
    label: 'Vertex snap',
    stage: 'material',
    description: 'Quantize vertices to a virtual low-resolution raster.'
  },
  {
    kind: 'affine-texture',
    label: 'Affine texture',
    stage: 'material',
    description: 'Use PS1-style affine UV interpolation.'
  },
  {
    kind: 'color-depth',
    label: 'Color depth',
    stage: 'post',
    description: 'Quantize the final image to RGB555, RGB332, or 1-bit color.'
  },
  {
    kind: 'dither',
    label: 'Dither',
    stage: 'post',
    description: 'Ordered dithering and color quantization.'
  }
];

const EFFECT_MAP = new Map(
  RENDER_EFFECT_DEFINITIONS.map((definition) => [definition.kind, definition])
);

/** Look up an effect definition. */
export function renderEffectDefinition(
  kind: RenderEffectKind
): RenderEffectDefinition {
  return EFFECT_MAP.get(kind) as RenderEffectDefinition;
}

/** Stage for an effect kind. */
export function renderEffectStage(kind: RenderEffectKind): RenderEffectStage {
  return renderEffectDefinition(kind).stage;
}

/** Whether a value is a supported effect kind. */
export function isRenderEffectKind(value: unknown): value is RenderEffectKind {
  return typeof value === 'string' && EFFECT_MAP.has(value as RenderEffectKind);
}

/** Whether a value is a supported color depth. */
export function isColorDepthMode(value: unknown): value is ColorDepthMode {
  return value === 'rgb555' || value === 'rgb332' || value === '1bit';
}

/** Whether a value is a supported dither pattern. */
export function isDitherPattern(value: unknown): value is DitherPattern {
  return value === 'bayer4' || value === 'bayer8';
}

/** Create one effect with its kind defaults. */
export function createRenderEffect(
  kind: RenderEffectKind,
  id: string
): RenderEffect {
  if (kind === 'vertex-snap') {
    return { id, kind, enabled: true, width: 320, height: 240 };
  }
  if (kind === 'affine-texture') {
    return { id, kind, enabled: true };
  }
  if (kind === 'dither') {
    return {
      id,
      kind,
      enabled: true,
      depth: 'rgb555',
      pattern: 'bayer4',
      strength: 1
    };
  }
  return { id, kind, enabled: true, depth: 'rgb555' };
}

/** Create the effects for a built-in preset. */
export function renderEffectPreset(
  preset: RenderEffectPreset,
  id: (kind: RenderEffectKind) => string
): RenderEffect[] {
  if (preset === 'clean') {
    return [];
  }
  if (preset === 'dither') {
    return [createRenderEffect('dither', id('dither'))];
  }
  return [
    createRenderEffect('vertex-snap', id('vertex-snap')),
    createRenderEffect('affine-texture', id('affine-texture')),
    createRenderEffect('dither', id('dither'))
  ];
}

/** Validate and normalize one persisted effect, or return null. */
export function normalizeRenderEffect(value: unknown): RenderEffect | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Partial<RenderEffect>;
  if (
    typeof raw.id !== 'string' ||
    raw.id.length === 0 ||
    raw.id.length > 120 ||
    !isRenderEffectKind(raw.kind) ||
    typeof raw.enabled !== 'boolean'
  ) {
    return null;
  }
  if (raw.kind === 'vertex-snap') {
    const width = typeof raw.width === 'number' ? Math.round(raw.width) : 320;
    const height = typeof raw.height === 'number' ? Math.round(raw.height) : 240;
    return {
      id: raw.id,
      kind: raw.kind,
      enabled: raw.enabled,
      width: Math.max(1, Math.min(4096, width)),
      height: Math.max(1, Math.min(4096, height))
    };
  }
  if (raw.kind === 'affine-texture') {
    return { id: raw.id, kind: raw.kind, enabled: raw.enabled };
  }
  if (!isColorDepthMode(raw.depth)) {
    return null;
  }
  if (raw.kind === 'color-depth') {
    return { id: raw.id, kind: raw.kind, enabled: raw.enabled, depth: raw.depth };
  }
  if (!isDitherPattern(raw.pattern)) {
    return null;
  }
  const strength =
    typeof raw.strength === 'number' ? Math.max(0, Math.min(1, raw.strength)) : 1;
  return {
    id: raw.id,
    kind: raw.kind,
    enabled: raw.enabled,
    depth: raw.depth,
    pattern: raw.pattern,
    strength
  };
}

/** Validate and normalize a persisted effect stack. */
export function normalizeRenderEffects(
  value: unknown
): RenderEffect[] | null {
  if (!Array.isArray(value) || value.length > 64) {
    return null;
  }
  const result: RenderEffect[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const effect = normalizeRenderEffect(item);
    if (!effect || ids.has(effect.id)) {
      return null;
    }
    ids.add(effect.id);
    result.push(effect);
  }
  return result;
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

const BAYER_8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21]
];

function colorLevels(depth: ColorDepthMode): readonly [number, number, number] {
  if (depth === 'rgb332') {
    return [8, 8, 4];
  }
  if (depth === '1bit') {
    return [2, 2, 2];
  }
  return [32, 32, 32];
}

function quantize(value: number, levels: number): number {
  const step = 255 / Math.max(1, levels - 1);
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

function ditherThreshold(pattern: DitherPattern, x: number, y: number): number {
  const matrix = pattern === 'bayer8' ? BAYER_8 : BAYER_4;
  const size = matrix.length;
  return (matrix[y % size][x % size] + 0.5) / (size * size) - 0.5;
}

/** Apply every enabled post effect in stack order to one image buffer. */
export function applyPostEffects(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effects: readonly RenderEffect[]
): Uint8ClampedArray {
  const active = effects.filter(
    (effect) => effect.enabled && renderEffectStage(effect.kind) === 'post'
  );
  if (active.length === 0 || width <= 0 || height <= 0) {
    return data;
  }
  const output = new Uint8ClampedArray(data);
  for (const effect of active) {
    if (effect.kind === 'color-depth') {
      const levels = colorLevels(effect.depth ?? 'rgb555');
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const offset = pixel * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          output[offset + channel] = quantize(
            output[offset + channel],
            levels[channel]
          );
        }
      }
      continue;
    }
    if (effect.kind === 'dither') {
      const levels = colorLevels(effect.depth ?? 'rgb555');
      const strength = effect.strength ?? 1;
      const pattern = effect.pattern ?? 'bayer4';
      const steps = levels.map((value) => 255 / Math.max(1, value - 1));
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const threshold =
            ditherThreshold(pattern, x, y) * strength;
          for (let channel = 0; channel < 3; channel += 1) {
            output[offset + channel] = quantize(
              output[offset + channel] + threshold * steps[channel],
              levels[channel]
            );
          }
        }
      }
    }
  }
  return output;
}

/** Detect whether a stack exactly matches one of the built-in presets. */
export function detectRenderEffectPreset(
  effects: readonly RenderEffect[]
): RenderEffectPreset | 'custom' {
  if (effects.length === 0) {
    return 'clean';
  }
  if (
    effects.length === 1 &&
    effects[0].kind === 'dither' &&
    effects[0].enabled &&
    effects[0].pattern === 'bayer4' &&
    effects[0].depth === 'rgb555' &&
    effects[0].strength === 1
  ) {
    return 'dither';
  }
  if (
    effects.length === 3 &&
    effects[0].kind === 'vertex-snap' &&
    effects[0].enabled &&
    effects[0].width === 320 &&
    effects[0].height === 240 &&
    effects[1].kind === 'affine-texture' &&
    effects[1].enabled &&
    effects[2].kind === 'dither' &&
    effects[2].enabled &&
    effects[2].pattern === 'bayer4' &&
    effects[2].depth === 'rgb555' &&
    effects[2].strength === 1
  ) {
    return 'ps1';
  }
  return 'custom';
}

/** Number of enabled post effects in a stack. */
export function postEffectCount(effects: readonly RenderEffect[]): number {
  return effects.filter(
    (effect) => effect.enabled && renderEffectStage(effect.kind) === 'post'
  ).length;
}

/** Material-space effect settings used by the PS1 shader path. */
export function materialEffectSettings(effects: readonly RenderEffect[]): {
  readonly snap: boolean;
  readonly affine: boolean;
  readonly resolution: Vec2;
} {
  const snap = effects.find(
    (effect) => effect.enabled && effect.kind === 'vertex-snap'
  );
  const affine = effects.some(
    (effect) => effect.enabled && effect.kind === 'affine-texture'
  );
  return {
    snap: Boolean(snap),
    affine,
    resolution: [snap?.width ?? 320, snap?.height ?? 240]
  };
}
