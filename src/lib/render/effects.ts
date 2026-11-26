import type { Vec2 } from '../geometry/HalfEdgeMesh';

/** Where an effect runs in the render pipeline. */
export type RenderEffectStage = 'material' | 'post';

/** Built-in render effect kinds. */
export type RenderEffectKind =
  | 'vertex-snap'
  | 'affine-texture'
  | 'color-depth'
  | 'dither'
  | 'color-grade'
  | 'posterize'
  | 'pixelate'
  | 'scanlines'
  | 'vignette'
  | 'grain'
  | 'chroma-bleed'
  | 'chromatic-aberration'
  | 'vhs-tracking'
  | 'crt-curvature'
  | 'bloom'
  | 'aperture-grille'
  | 'interlace'
  | 'dropout'
  | 'ghost-trails'
  | 'motion-blur'
  | 'compression'
  | 'film-damage'
  | 'head-switching';

/** Quantization target for color-depth and dither effects. */
export type ColorDepthMode = 'rgb555' | 'rgb332' | '1bit';

/** Ordered dither matrices. */
export type DitherPattern = 'bayer4' | 'bayer8';

/** Color treatment used by the color-grade effect. */
export type ColorGradeMode = 'normal' | 'monochrome' | 'sepia' | 'invert';

/** Spatial direction used by chromatic aberration. */
export type ChromaticMode = 'horizontal' | 'radial';

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
  readonly amount?: number;
  readonly mode?: ColorGradeMode | ChromaticMode;
  readonly saturation?: number;
  readonly contrast?: number;
  readonly levels?: number;
  readonly blockSize?: number;
  readonly spacing?: number;
  readonly radius?: number;
  readonly frequency?: number;
  readonly speed?: number;
  readonly count?: number;
  readonly threshold?: number;
  readonly angle?: number;
  readonly mix?: number;
}

/** One built-in preset. */
export type RenderEffectPreset =
  | 'clean'
  | 'ps1'
  | 'dither'
  | 'vhs'
  | 'crt'
  | 'film';

/** Human-readable metadata for the effect stack UI. */
export interface RenderEffectDefinition {
  readonly kind: RenderEffectKind;
  readonly label: string;
  readonly stage: RenderEffectStage;
  readonly description: string;
}

/** Registry for effect creation and Inspector labels. */
export const RENDER_EFFECT_DEFINITIONS: readonly RenderEffectDefinition[] = [
  { kind: 'vertex-snap', label: 'Vertex snap', stage: 'material', description: 'Quantize vertices to a virtual low-resolution raster.' },
  { kind: 'affine-texture', label: 'Affine texture', stage: 'material', description: 'Use PS1-style affine UV interpolation.' },
  { kind: 'color-depth', label: 'Color depth', stage: 'post', description: 'Quantize to RGB555, RGB332, or 1-bit colour.' },
  { kind: 'dither', label: 'Dither', stage: 'post', description: 'Ordered dithering and color quantization.' },
  { kind: 'color-grade', label: 'Color grade', stage: 'post', description: 'Adjust saturation and contrast, or apply monochrome, sepia, or inversion.' },
  { kind: 'posterize', label: 'Posterize', stage: 'post', description: 'Reduce the number of tonal levels.' },
  { kind: 'pixelate', label: 'Pixelate', stage: 'post', description: 'Resample the image into chunky blocks.' },
  { kind: 'scanlines', label: 'Scanlines', stage: 'post', description: 'Darken rows at a fixed pixel spacing.' },
  { kind: 'vignette', label: 'Vignette', stage: 'post', description: 'Darken toward the frame edges.' },
  { kind: 'grain', label: 'Grain', stage: 'post', description: 'Deterministic animated film grain.' },
  { kind: 'chroma-bleed', label: 'Chroma bleed', stage: 'post', description: 'Smear red and blue horizontally like composite video.' },
  { kind: 'chromatic-aberration', label: 'Chromatic aberration', stage: 'post', description: 'Offset red and blue channels horizontally or radially.' },
  { kind: 'vhs-tracking', label: 'VHS tracking', stage: 'post', description: 'Displace rows to imitate unstable tape tracking.' },
  { kind: 'crt-curvature', label: 'CRT curvature', stage: 'post', description: 'Warp the frame toward a curved tube.' },
  { kind: 'bloom', label: 'Bloom', stage: 'post', description: 'Blur bright areas and add glow.' },
  { kind: 'aperture-grille', label: 'Aperture grille', stage: 'post', description: 'Add a colour-channel shadow mask.' },
  { kind: 'interlace', label: 'Interlace', stage: 'post', description: 'Alternate field darkening.' },
  { kind: 'dropout', label: 'Dropout bands', stage: 'post', description: 'Add damaged horizontal tape bands.' },
  { kind: 'ghost-trails', label: 'Ghost trails', stage: 'post', description: 'Blend the previous rendered frame into this one.' },
  { kind: 'motion-blur', label: 'Motion blur', stage: 'post', description: 'Directional spatial blur.' },
  { kind: 'compression', label: 'Compression', stage: 'post', description: 'Blocky compression artifacts and colour loss.' },
  { kind: 'film-damage', label: 'Film damage', stage: 'post', description: 'Dust specks and vertical scratches.' },
  { kind: 'head-switching', label: 'Head switching', stage: 'post', description: 'Noisy shifted band at the bottom of the frame.' }
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

function isColorGradeMode(value: unknown): value is ColorGradeMode {
  return value === 'normal' || value === 'monochrome' || value === 'sepia' || value === 'invert';
}

function isChromaticMode(value: unknown): value is ChromaticMode {
  return value === 'horizontal' || value === 'radial';
}

/** Create one effect with its kind defaults. */
export function createRenderEffect(
  kind: RenderEffectKind,
  id: string
): RenderEffect {
  switch (kind) {
    case 'vertex-snap':
      return { id, kind, enabled: true, width: 320, height: 240 };
    case 'affine-texture':
      return { id, kind, enabled: true };
    case 'color-depth':
      return { id, kind, enabled: true, depth: 'rgb555' };
    case 'dither':
      return { id, kind, enabled: true, depth: 'rgb555', pattern: 'bayer4', strength: 1 };
    case 'color-grade':
      return { id, kind, enabled: true, mode: 'normal', saturation: 1, contrast: 1 };
    case 'posterize':
      return { id, kind, enabled: true, levels: 6 };
    case 'pixelate':
      return { id, kind, enabled: true, blockSize: 2 };
    case 'scanlines':
      return { id, kind, enabled: true, strength: 0.25, spacing: 2 };
    case 'vignette':
      return { id, kind, enabled: true, strength: 0.3, radius: 0.7 };
    case 'grain':
      return { id, kind, enabled: true, strength: 0.08 };
    case 'chroma-bleed':
      return { id, kind, enabled: true, amount: 1 };
    case 'chromatic-aberration':
      return { id, kind, enabled: true, amount: 1.5, mode: 'horizontal' };
    case 'vhs-tracking':
      return { id, kind, enabled: true, amount: 1.2, frequency: 0.08, speed: 1 };
    case 'crt-curvature':
      return { id, kind, enabled: true, amount: 0.08 };
    case 'bloom':
      return { id, kind, enabled: true, threshold: 0.75, strength: 0.3, radius: 3 };
    case 'aperture-grille':
      return { id, kind, enabled: true, strength: 0.25, spacing: 3 };
    case 'interlace':
      return { id, kind, enabled: true, strength: 0.2 };
    case 'dropout':
      return { id, kind, enabled: true, strength: 0.4, count: 3 };
    case 'ghost-trails':
      return { id, kind, enabled: true, mix: 0.35 };
    case 'motion-blur':
      return { id, kind, enabled: true, amount: 2, angle: 0 };
    case 'compression':
      return { id, kind, enabled: true, blockSize: 4, strength: 0.5 };
    case 'film-damage':
      return { id, kind, enabled: true, strength: 0.25, count: 3 };
    case 'head-switching':
      return { id, kind, enabled: true, strength: 0.5, height: 8 };
  }
}

/** Create the effects for a built-in preset. */
export function renderEffectPreset(
  preset: RenderEffectPreset,
  id: (kind: RenderEffectKind) => string
): RenderEffect[] {
  const effect = (kind: RenderEffectKind): RenderEffect =>
    createRenderEffect(kind, id(kind));
  if (preset === 'clean') {
    return [];
  }
  if (preset === 'dither') {
    return [effect('dither')];
  }
  if (preset === 'vhs') {
    return [
      { ...effect('vhs-tracking') },
      effect('chromatic-aberration'),
      effect('chroma-bleed'),
      effect('color-grade'),
      effect('scanlines'),
      effect('grain'),
      effect('vignette')
    ];
  }
  if (preset === 'crt') {
    return [
      effect('scanlines'),
      effect('aperture-grille'),
      effect('bloom'),
      effect('vignette')
    ];
  }
  if (preset === 'film') {
    return [
      effect('color-grade'),
      effect('grain'),
      effect('film-damage'),
      effect('vignette')
    ];
  }
  return [
    effect('vertex-snap'),
    effect('affine-texture'),
    effect('dither')
  ];
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
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
  const base = { id: raw.id, kind: raw.kind, enabled: raw.enabled };
  switch (raw.kind) {
    case 'vertex-snap':
      return {
        ...base,
        width: Math.round(clampNumber(raw.width, 320, 1, 4096)),
        height: Math.round(clampNumber(raw.height, 240, 1, 4096))
      };
    case 'affine-texture':
      return base;
    case 'color-grade':
      return {
        ...base,
        mode: isColorGradeMode(raw.mode) ? raw.mode : 'normal',
        saturation: clampNumber(raw.saturation, 1, 0, 2),
        contrast: clampNumber(raw.contrast, 1, 0, 2)
      };
    case 'posterize':
      return { ...base, levels: Math.round(clampNumber(raw.levels, 6, 2, 64)) };
    case 'pixelate':
      return { ...base, blockSize: Math.round(clampNumber(raw.blockSize, 2, 1, 64)) };
    case 'scanlines':
      return {
        ...base,
        strength: clampNumber(raw.strength, 0.25, 0, 1),
        spacing: Math.round(clampNumber(raw.spacing, 2, 1, 16))
      };
    case 'vignette':
      return {
        ...base,
        strength: clampNumber(raw.strength, 0.3, 0, 1),
        radius: clampNumber(raw.radius, 0.7, 0, 2)
      };
    case 'grain':
      return { ...base, strength: clampNumber(raw.strength, 0.08, 0, 1) };
    case 'chroma-bleed':
      return { ...base, amount: Math.round(clampNumber(raw.amount, 1, 0, 8)) };
    case 'chromatic-aberration':
      return {
        ...base,
        amount: clampNumber(raw.amount, 1.5, 0, 8),
        mode: isChromaticMode(raw.mode) ? raw.mode : 'horizontal'
      };
    case 'vhs-tracking':
      return {
        ...base,
        amount: clampNumber(raw.amount, 1.2, 0, 16),
        frequency: clampNumber(raw.frequency, 0.08, 0.001, 1),
        speed: clampNumber(raw.speed, 1, 0, 4)
      };
    case 'crt-curvature':
      return { ...base, amount: clampNumber(raw.amount, 0.08, 0, 0.5) };
    case 'bloom':
      return {
        ...base,
        threshold: clampNumber(raw.threshold, 0.75, 0, 1),
        strength: clampNumber(raw.strength, 0.3, 0, 2),
        radius: Math.round(clampNumber(raw.radius, 3, 1, 32))
      };
    case 'aperture-grille':
      return {
        ...base,
        strength: clampNumber(raw.strength, 0.25, 0, 1),
        spacing: Math.round(clampNumber(raw.spacing, 3, 2, 12))
      };
    case 'interlace':
      return { ...base, strength: clampNumber(raw.strength, 0.2, 0, 1) };
    case 'dropout':
      return {
        ...base,
        strength: clampNumber(raw.strength, 0.4, 0, 1),
        count: Math.round(clampNumber(raw.count, 3, 1, 32))
      };
    case 'ghost-trails':
      return { ...base, mix: clampNumber(raw.mix, 0.35, 0, 1) };
    case 'motion-blur':
      return {
        ...base,
        amount: clampNumber(raw.amount, 2, 0, 32),
        angle: clampNumber(raw.angle, 0, -180, 180)
      };
    case 'compression':
      return {
        ...base,
        blockSize: Math.round(clampNumber(raw.blockSize, 4, 1, 32)),
        strength: clampNumber(raw.strength, 0.5, 0, 1)
      };
    case 'film-damage':
      return {
        ...base,
        strength: clampNumber(raw.strength, 0.25, 0, 1),
        count: Math.round(clampNumber(raw.count, 3, 1, 32))
      };
    case 'head-switching':
      return {
        ...base,
        strength: clampNumber(raw.strength, 0.5, 0, 1),
        height: Math.round(clampNumber(raw.height, 8, 1, 64))
      };
    case 'dither':
      if (!isColorDepthMode(raw.depth) || !isDitherPattern(raw.pattern)) {
        return null;
      }
      return {
        ...base,
        depth: raw.depth,
        pattern: raw.pattern,
        strength: clampNumber(raw.strength, 1, 0, 1)
      };
    case 'color-depth':
      if (!isColorDepthMode(raw.depth)) {
        return null;
      }
      return { ...base, depth: raw.depth };
  }
}

/** Validate and normalize a persisted effect stack. */
export function normalizeRenderEffects(value: unknown): RenderEffect[] | null {
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

function hash(x: number, y: number, seed = 0, frame = 0): number {
  let value = (x * 374761393 + y * 668265263 + seed * 144269 + frame * 2246822519) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function sample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number
): number {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  return data[(py * width + px) * 4 + channel];
}

function copyImage(data: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(data);
}

function applyColorGrade(
  data: Uint8ClampedArray,
  effect: RenderEffect
): Uint8ClampedArray {
  const mode = effect.mode ?? 'normal';
  const saturation = effect.saturation ?? 1;
  const contrast = effect.contrast ?? 1;
  for (let index = 0; index < data.length; index += 4) {
    let r = data[index];
    let g = data[index + 1];
    let b = data[index + 2];
    if (mode === 'monochrome' || mode === 'sepia') {
      const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (mode === 'monochrome') {
        r = gray;
        g = gray;
        b = gray;
      } else {
        r = gray * 1.07;
        g = gray * 0.86;
        b = gray * 0.62;
      }
    } else if (mode === 'invert') {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    if (saturation !== 1) {
      const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }
    if (contrast !== 1) {
      r = 128 + (r - 128) * contrast;
      g = 128 + (g - 128) * contrast;
      b = 128 + (b - 128) * contrast;
    }
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
  }
  return data;
}

function applyPosterize(data: Uint8ClampedArray, effect: RenderEffect): Uint8ClampedArray {
  const levels = effect.levels ?? 6;
  const result = copyImage(data);
  for (let index = 0; index < result.length; index += 4) {
    result[index] = quantize(result[index], levels);
    result[index + 1] = quantize(result[index + 1], levels);
    result[index + 2] = quantize(result[index + 2], levels);
  }
  return result;
}

function applyPixelate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const block = Math.max(1, effect.blockSize ?? 2);
  const result = copyImage(data);
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let dy = 0; dy < block && y + dy < height; dy += 1) {
        for (let dx = 0; dx < block && x + dx < width; dx += 1) {
          const index = ((y + dy) * width + x + dx) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          a += data[index + 3];
          count += 1;
        }
      }
      for (let dy = 0; dy < block && y + dy < height; dy += 1) {
        for (let dx = 0; dx < block && x + dx < width; dx += 1) {
          const index = ((y + dy) * width + x + dx) * 4;
          result[index] = r / count;
          result[index + 1] = g / count;
          result[index + 2] = b / count;
          result[index + 3] = a / count;
        }
      }
    }
  }
  return result;
}

function applyScanlines(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.25;
  const spacing = Math.max(1, effect.spacing ?? 2);
  for (let y = 0; y < height; y += 1) {
    const factor = y % spacing === 0 ? 1 - strength : 1;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      result[index] *= factor;
      result[index + 1] *= factor;
      result[index + 2] *= factor;
    }
  }
  return result;
}

function applyVignette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.3;
  const radius = effect.radius ?? 0.7;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxDistance = Math.hypot(cx, cy);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - cx, y - cy) / maxDistance;
      const factor = Math.max(0, 1 - Math.max(0, distance - radius) * strength);
      const index = (y * width + x) * 4;
      result[index] *= factor;
      result[index + 1] *= factor;
      result[index + 2] *= factor;
    }
  }
  return result;
}

function applyGrain(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect,
  frame: number
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = (effect.strength ?? 0.08) * 255;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const noise = (hash(x, y, 7, frame) - 0.5) * strength;
      result[index] += noise;
      result[index + 1] += noise;
      result[index + 2] += noise;
    }
  }
  return result;
}

function applyChromaBleed(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const amount = Math.max(0, Math.round(effect.amount ?? 1));
  if (amount === 0) {
    return result;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let r = 0;
      let b = 0;
      let count = 0;
      for (let offset = -amount; offset <= amount; offset += 1) {
        const sampleX = x + offset;
        if (sampleX < 0 || sampleX >= width) {
          continue;
        }
        const source = (y * width + sampleX) * 4;
        r += data[source];
        b += data[source + 2];
        count += 1;
      }
      result[index] = r / Math.max(1, count);
      result[index + 2] = b / Math.max(1, count);
    }
  }
  return result;
}

function applyChromaticAberration(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const amount = effect.amount ?? 1.5;
  const radial = effect.mode === 'radial';
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const dx = radial ? (x - cx) / Math.max(1, cx) : 1;
      const dy = radial ? (y - cy) / Math.max(1, cy) : 0;
      result[index] = sample(data, width, height, x + dx * amount, y + dy * amount, 0);
      result[index + 2] = sample(data, width, height, x - dx * amount, y - dy * amount, 2);
    }
  }
  return result;
}

function applyVhsTracking(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect,
  frame: number
): Uint8ClampedArray {
  const result = copyImage(data);
  const amount = effect.amount ?? 1.2;
  const frequency = effect.frequency ?? 0.08;
  const speed = effect.speed ?? 1;
  for (let y = 0; y < height; y += 1) {
    const band = hash(0, y, 3, frame) > 0.985 ? amount * 4 : 0;
    const shift = Math.sin(y * frequency + frame * speed) * amount + band;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const sourceX = x + shift;
      result[index] = sample(data, width, height, sourceX, y, 0);
      result[index + 1] = sample(data, width, height, sourceX, y, 1);
      result[index + 2] = sample(data, width, height, sourceX, y, 2);
    }
  }
  return result;
}

function applyCrtCurvature(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const amount = effect.amount ?? 0.08;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x / Math.max(1, width - 1)) * 2 - 1;
      const ny = (y / Math.max(1, height - 1)) * 2 - 1;
      const distortion = 1 + amount * (nx * nx + ny * ny);
      const sourceX = (nx / distortion + 1) * 0.5 * (width - 1);
      const sourceY = (ny / distortion + 1) * 0.5 * (height - 1);
      const index = (y * width + x) * 4;
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) {
        result[index] = 0;
        result[index + 1] = 0;
        result[index + 2] = 0;
        continue;
      }
      result[index] = sample(data, width, height, sourceX, sourceY, 0);
      result[index + 1] = sample(data, width, height, sourceX, sourceY, 1);
      result[index + 2] = sample(data, width, height, sourceX, sourceY, 2);
    }
  }
  return result;
}

function applyBloom(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const threshold = (effect.threshold ?? 0.75) * 255;
  const strength = effect.strength ?? 0.3;
  const radius = Math.max(1, Math.round(effect.radius ?? 3));
  const bright = new Float32Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const luma = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    if (luma > threshold) {
      bright[pixel * 3] = data[index];
      bright[pixel * 3 + 1] = data[index + 1];
      bright[pixel * 3 + 2] = data[index + 2];
    }
  }
  const result = copyImage(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = y + dy;
        if (sy < 0 || sy >= height) {
          continue;
        }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = x + dx;
          if (sx < 0 || sx >= width) {
            continue;
          }
          const source = (sy * width + sx) * 3;
          r += bright[source];
          g += bright[source + 1];
          b += bright[source + 2];
          count += 1;
        }
      }
      if (count > 0) {
        const index = (y * width + x) * 4;
        result[index] += (r / count) * strength;
        result[index + 1] += (g / count) * strength;
        result[index + 2] += (b / count) * strength;
      }
    }
  }
  return result;
}

function applyApertureGrille(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.25;
  const spacing = Math.max(2, Math.round(effect.spacing ?? 3));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const phase = x % spacing;
      const factor = 1 - (phase === 0 ? strength : phase === 1 ? strength * 0.5 : 0);
      const index = (y * width + x) * 4;
      result[index] *= phase === 0 ? factor * 1.08 : factor;
      result[index + 1] *= phase === 1 ? factor * 1.05 : factor;
      result[index + 2] *= phase === 2 ? factor * 1.08 : factor;
    }
  }
  return result;
}

function applyInterlace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect,
  frame: number
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.2;
  const field = Math.abs(Math.round(frame)) % 2;
  for (let y = 0; y < height; y += 1) {
    if (y % 2 !== field) {
      continue;
    }
    const factor = 1 - strength;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      result[index] *= factor;
      result[index + 1] *= factor;
      result[index + 2] *= factor;
    }
  }
  return result;
}

function applyDropout(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect,
  frame: number
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.4;
  const count = Math.max(1, Math.round(effect.count ?? 3));
  for (let band = 0; band < count; band += 1) {
    const y = Math.floor(hash(band, 1, 5, frame) * height);
    const bandHeight = 1 + Math.floor(hash(band, 2, 5, frame) * 3);
    const shift = (hash(band, 3, 5, frame) - 0.5) * width * 0.05;
    for (let row = y; row < Math.min(height, y + bandHeight); row += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (row * width + x) * 4;
        const sourceX = x + shift;
        result[index] = sample(data, width, height, sourceX, row, 0) * (1 - strength * 0.5) + 255 * strength * 0.15;
        result[index + 1] = sample(data, width, height, sourceX, row, 1) * (1 - strength * 0.5);
        result[index + 2] = sample(data, width, height, sourceX, row, 2) * (1 - strength * 0.5) + 255 * strength * 0.1;
      }
    }
  }
  return result;
}

function applyGhostTrails(
  data: Uint8ClampedArray,
  effect: RenderEffect,
  previous: Uint8ClampedArray | null
): Uint8ClampedArray {
  if (!previous || previous.length !== data.length) {
    return copyImage(data);
  }
  const result = copyImage(data);
  const mix = effect.mix ?? 0.35;
  for (let index = 0; index < result.length; index += 4) {
    result[index] = result[index] * (1 - mix) + previous[index] * mix;
    result[index + 1] = result[index + 1] * (1 - mix) + previous[index + 1] * mix;
    result[index + 2] = result[index + 2] * (1 - mix) + previous[index + 2] * mix;
    result[index + 3] = Math.max(result[index + 3], previous[index + 3]);
  }
  return result;
}

function applyMotionBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const result = copyImage(data);
  const amount = Math.max(0, Math.round(effect.amount ?? 2));
  if (amount === 0) {
    return result;
  }
  const angle = ((effect.angle ?? 0) * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let step = -amount; step <= amount; step += 1) {
        r += sample(data, width, height, x + dx * step, y + dy * step, 0);
        g += sample(data, width, height, x + dx * step, y + dy * step, 1);
        b += sample(data, width, height, x + dx * step, y + dy * step, 2);
        count += 1;
      }
      result[index] = r / count;
      result[index + 1] = g / count;
      result[index + 2] = b / count;
    }
  }
  return result;
}

function applyCompression(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect
): Uint8ClampedArray {
  const block = Math.max(1, Math.round(effect.blockSize ?? 4));
  const strength = effect.strength ?? 0.5;
  const result = copyImage(data);
  for (let y = 0; y < height; y += block) {
    for (let x = 0; x < width; x += block) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let dy = 0; dy < block && y + dy < height; dy += 1) {
        for (let dx = 0; dx < block && x + dx < width; dx += 1) {
          const index = ((y + dy) * width + x + dx) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          a += data[index + 3];
          count += 1;
        }
      }
      const avgR = quantize(r / count, 16);
      const avgG = quantize(g / count, 16);
      const avgB = quantize(b / count, 16);
      for (let dy = 0; dy < block && y + dy < height; dy += 1) {
        for (let dx = 0; dx < block && x + dx < width; dx += 1) {
          const index = ((y + dy) * width + x + dx) * 4;
          result[index] = data[index] * (1 - strength) + avgR * strength;
          result[index + 1] = data[index + 1] * (1 - strength) + avgG * strength;
          result[index + 2] = data[index + 2] * (1 - strength) + avgB * strength;
          result[index + 3] = a / count;
        }
      }
    }
  }
  return result;
}

function applyFilmDamage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect,
  frame: number
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.25;
  const count = Math.max(1, Math.round(effect.count ?? 3));
  for (let spot = 0; spot < count * 18; spot += 1) {
    const x = Math.floor(hash(spot, 1, 11, frame) * width);
    const y = Math.floor(hash(spot, 2, 11, frame) * height);
    const size = 1 + Math.floor(hash(spot, 3, 11, frame) * 3);
    const dark = hash(spot, 4, 11, frame) > 0.5;
    for (let dy = 0; dy < size; dy += 1) {
      for (let dx = 0; dx < size; dx += 1) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= width || py < 0 || py >= height) {
          continue;
        }
        const index = (py * width + px) * 4;
        const value = dark ? 0 : 255;
        result[index] = result[index] * (1 - strength) + value * strength;
        result[index + 1] = result[index + 1] * (1 - strength) + value * strength;
        result[index + 2] = result[index + 2] * (1 - strength) + value * strength;
      }
    }
  }
  for (let scratch = 0; scratch < count; scratch += 1) {
    const x = Math.floor(hash(scratch, 5, 11, frame) * width);
    for (let y = 0; y < height; y += 1) {
      if (hash(x, y, 12, frame) > 0.7) {
        continue;
      }
      const index = (y * width + x) * 4;
      result[index] = result[index] * (1 - strength * 0.6) + 200 * strength * 0.6;
      result[index + 1] = result[index + 1] * (1 - strength * 0.6) + 200 * strength * 0.6;
      result[index + 2] = result[index + 2] * (1 - strength * 0.6) + 200 * strength * 0.6;
    }
  }
  return result;
}

function applyHeadSwitching(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: RenderEffect,
  frame: number
): Uint8ClampedArray {
  const result = copyImage(data);
  const strength = effect.strength ?? 0.5;
  const bandHeight = Math.max(1, Math.round(effect.height ?? 8));
  const start = Math.max(0, height - bandHeight);
  for (let y = start; y < height; y += 1) {
    const shift = (hash(0, y, 13, frame) - 0.5) * width * 0.08;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      result[index] = sample(data, width, height, x + shift, y, 0) * (1 - strength * 0.3) + 255 * strength * 0.12;
      result[index + 1] = sample(data, width, height, x + shift, y, 1) * (1 - strength * 0.3);
      result[index + 2] = sample(data, width, height, x + shift, y, 2) * (1 - strength * 0.3);
    }
  }
  return result;
}

/** Additional context for post effects that need temporal or deterministic data. */
export interface PostEffectContext {
  readonly frame?: number;
  readonly previous?: Uint8ClampedArray | null;
}

/** Apply every enabled post effect in stack order to one image buffer. */
export function applyPostEffects(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effects: readonly RenderEffect[],
  context: PostEffectContext = {}
): Uint8ClampedArray {
  const active = effects.filter(
    (effect) => effect.enabled && renderEffectStage(effect.kind) === 'post'
  );
  if (active.length === 0 || width <= 0 || height <= 0) {
    return data;
  }
  const frame = Math.round(context.frame ?? 0);
  let current = copyImage(data);
  for (const effect of active) {
    switch (effect.kind) {
      case 'color-grade':
        current = applyColorGrade(current, effect);
        break;
      case 'posterize':
        current = applyPosterize(current, effect);
        break;
      case 'pixelate':
        current = applyPixelate(current, width, height, effect);
        break;
      case 'scanlines':
        current = applyScanlines(current, width, height, effect);
        break;
      case 'vignette':
        current = applyVignette(current, width, height, effect);
        break;
      case 'grain':
        current = applyGrain(current, width, height, effect, frame);
        break;
      case 'chroma-bleed':
        current = applyChromaBleed(current, width, height, effect);
        break;
      case 'chromatic-aberration':
        current = applyChromaticAberration(current, width, height, effect);
        break;
      case 'vhs-tracking':
        current = applyVhsTracking(current, width, height, effect, frame);
        break;
      case 'crt-curvature':
        current = applyCrtCurvature(current, width, height, effect);
        break;
      case 'bloom':
        current = applyBloom(current, width, height, effect);
        break;
      case 'aperture-grille':
        current = applyApertureGrille(current, width, height, effect);
        break;
      case 'interlace':
        current = applyInterlace(current, width, height, effect, frame);
        break;
      case 'dropout':
        current = applyDropout(current, width, height, effect, frame);
        break;
      case 'ghost-trails':
        current = applyGhostTrails(current, effect, context.previous ?? null);
        break;
      case 'motion-blur':
        current = applyMotionBlur(current, width, height, effect);
        break;
      case 'compression':
        current = applyCompression(current, width, height, effect);
        break;
      case 'film-damage':
        current = applyFilmDamage(current, width, height, effect, frame);
        break;
      case 'head-switching':
        current = applyHeadSwitching(current, width, height, effect, frame);
        break;
      case 'color-depth': {
        const levels = colorLevels(effect.depth ?? 'rgb555');
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          const offset = pixel * 4;
          current[offset] = quantize(current[offset], levels[0]);
          current[offset + 1] = quantize(current[offset + 1], levels[1]);
          current[offset + 2] = quantize(current[offset + 2], levels[2]);
        }
        break;
      }
      case 'dither': {
        const levels = colorLevels(effect.depth ?? 'rgb555');
        const strength = effect.strength ?? 1;
        const pattern = effect.pattern ?? 'bayer4';
        const steps = levels.map((value) => 255 / Math.max(1, value - 1));
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            const threshold = ditherThreshold(pattern, x, y) * strength;
            for (let channel = 0; channel < 3; channel += 1) {
              current[offset + channel] = quantize(
                current[offset + channel] + threshold * steps[channel],
                levels[channel]
              );
            }
          }
        }
        break;
      }
    }
  }
  return current;
}

/** Number of enabled post effects in a stack. */
export function postEffectCount(effects: readonly RenderEffect[]): number {
  return effects.filter(
    (effect) => effect.enabled && renderEffectStage(effect.kind) === 'post'
  ).length;
}

/** Whether a stack contains an effect that needs the previous rendered frame. */
export function hasTemporalEffects(effects: readonly RenderEffect[]): boolean {
  return effects.some(
    (effect) => effect.enabled && effect.kind === 'ghost-trails'
  );
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

/** Compare two effect stacks ignoring generated ids. */
function effectsEqual(
  a: readonly RenderEffect[],
  b: readonly RenderEffect[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const keys: (keyof RenderEffect)[] = [
    'kind', 'enabled', 'width', 'height', 'depth', 'pattern', 'strength',
    'amount', 'mode', 'saturation', 'contrast', 'levels', 'blockSize',
    'spacing', 'radius', 'frequency', 'speed', 'count', 'threshold', 'angle', 'mix'
  ];
  return a.every((effect, index) =>
    keys.every((key) => effect[key] === b[index][key])
  );
}

/** Detect whether a stack exactly matches one of the built-in presets. */
export function detectRenderEffectPreset(
  effects: readonly RenderEffect[]
): RenderEffectPreset | 'custom' {
  if (effects.length === 0) {
    return 'clean';
  }
  const presets: RenderEffectPreset[] = ['dither', 'ps1', 'vhs', 'crt', 'film'];
  for (const preset of presets) {
    let sequence = 0;
    const candidate = renderEffectPreset(preset, () => `detect-${sequence++}`);
    if (effectsEqual(effects, candidate)) {
      return preset;
    }
  }
  return 'custom';
}
