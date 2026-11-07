/** Supported non-destructive texture post-processing effects. */
export type TextureEffectType = 'tone' | 'posterize' | 'dither';

/** Exposure, contrast, and gamma adjustment. */
export interface TextureToneEffect {
  readonly type: 'tone';
  readonly exposure: number;
  readonly contrast: number;
  readonly gamma: number;
}

/** Quantize each sRGB channel into a fixed number of levels. */
export interface TexturePosterizeEffect {
  readonly type: 'posterize';
  readonly levels: number;
}

/** Ordered or error-diffusion dithering. */
export interface TextureDitherEffect {
  readonly type: 'dither';
  readonly mode: 'ordered' | 'diffusion';
  readonly matrix: 2 | 4 | 8;
  readonly levels: number;
  readonly monochrome: boolean;
}

/** One serializable post-processing operation. */
export type TextureEffect =
  | TextureToneEffect
  | TexturePosterizeEffect
  | TextureDitherEffect;

/** Human-readable layer label for an effect type. */
export function textureEffectLabel(type: TextureEffectType): string {
  if (type === 'tone') return 'Tone';
  if (type === 'posterize') return 'Posterize';
  return 'Dither';
}

/** Create an effect with bounded defaults. */
export function createTextureEffect(type: TextureEffectType): TextureEffect {
  if (type === 'tone') {
    return { type, exposure: 0, contrast: 0, gamma: 1 };
  }
  if (type === 'posterize') {
    return { type, levels: 4 };
  }
  return {
    type,
    mode: 'ordered',
    matrix: 4,
    levels: 4,
    monochrome: false
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

/** Normalize untrusted effect metadata, returning null when invalid. */
export function normalizeTextureEffect(value: unknown): TextureEffect | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const effect = value as Partial<TextureEffect> & { type?: unknown };
  if (effect.type === 'tone') {
    return {
      type: 'tone',
      exposure: clamp(finite(effect.exposure, 0), -2, 2),
      contrast: clamp(finite(effect.contrast, 0), -1, 1),
      gamma: clamp(finite(effect.gamma, 1), 0.2, 3)
    };
  }
  if (effect.type === 'posterize') {
    return {
      type: 'posterize',
      levels: Math.round(clamp(finite(effect.levels, 4), 2, 32))
    };
  }
  if (effect.type === 'dither') {
    const matrix = effect.matrix === 2 || effect.matrix === 8 ? effect.matrix : 4;
    return {
      type: 'dither',
      mode: effect.mode === 'diffusion' ? 'diffusion' : 'ordered',
      matrix,
      levels: Math.round(clamp(finite(effect.levels, 4), 2, 32)),
      monochrome: effect.monochrome === true
    };
  }
  return null;
}

/** Stable equality for serialized effect metadata. */
export function textureEffectsEqual(
  a: TextureEffect | null,
  b: TextureEffect | null
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toneLut(effect: TextureToneEffect): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const exposure = 2 ** effect.exposure;
  const contrast = 1 / Math.max(0.01, 1 - effect.contrast);
  const gamma = 1 / Math.max(0.01, effect.gamma);
  for (let i = 0; i < 256; i += 1) {
    let value = i / 255;
    value = (value - 0.5) * contrast + 0.5;
    value = Math.pow(Math.max(0, value), gamma) * exposure;
    lut[i] = Math.round(clamp(value, 0, 1) * 255);
  }
  return lut;
}

function posterizeLut(levels: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const denominator = Math.max(1, levels - 1);
  for (let i = 0; i < 256; i += 1) {
    const quantized = Math.round((i / 255) * denominator) / denominator;
    lut[i] = Math.round(quantized * 255);
  }
  return lut;
}

function bayerMatrix(size: 2 | 4 | 8): number[][] {
  let matrix = [
    [0, 2],
    [3, 1]
  ];
  while (matrix.length < size) {
    const current = matrix.length;
    const next = Array.from({ length: current * 2 }, () =>
      new Array<number>(current * 2).fill(0)
    );
    for (let y = 0; y < current; y += 1) {
      for (let x = 0; x < current; x += 1) {
        const value = matrix[y][x] * 4;
        next[y][x] = value;
        next[y][x + current] = value + 2;
        next[y + current][x] = value + 3;
        next[y + current][x + current] = value + 1;
      }
    }
    matrix = next;
  }
  return matrix;
}

function applyDither(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: TextureDitherEffect
): void {
  const levels = Math.max(2, Math.round(effect.levels));
  const denominator = levels - 1;
  const quantize = (value: number): number =>
    Math.round(clamp(value, 0, 1) * denominator) / denominator;
  if (effect.mode === 'ordered') {
    const matrix = bayerMatrix(effect.matrix);
    const size = matrix.length;
    const cells = size * size;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const threshold = (matrix[y % size][x % size] + 0.5) / cells - 0.5;
        if (effect.monochrome) {
          const luma =
            (data[offset] * 0.2126 +
              data[offset + 1] * 0.7152 +
              data[offset + 2] * 0.0722) /
            255;
          const value = Math.round(clamp(luma + threshold / denominator, 0, 1) * 255);
          data[offset] = value;
          data[offset + 1] = value;
          data[offset + 2] = value;
          continue;
        }
        for (let channel = 0; channel < 3; channel += 1) {
          const value = data[offset + channel] / 255 + threshold / denominator;
          data[offset + channel] = Math.round(quantize(value) * 255);
        }
      }
    }
    return;
  }

  const rowErrors = new Float32Array((width + 2) * 3);
  const nextErrors = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y += 1) {
    nextErrors.fill(0);
    const reverse = y % 2 === 1;
    for (let step = 0; step < width; step += 1) {
      const x = reverse ? width - 1 - step : step;
      const offset = (y * width + x) * 4;
      const errorOffset = (x + 1) * 3;
      if (effect.monochrome) {
        const luma =
          (data[offset] * 0.2126 +
            data[offset + 1] * 0.7152 +
            data[offset + 2] * 0.0722) /
          255;
        const value = quantize(
          luma +
            (rowErrors[errorOffset] +
              rowErrors[errorOffset + 1] +
              rowErrors[errorOffset + 2]) /
              3
        );
        const encoded = Math.round(value * 255);
        data[offset] = encoded;
        data[offset + 1] = encoded;
        data[offset + 2] = encoded;
        const error = luma - value;
        const direction = reverse ? -1 : 1;
        for (let channel = 0; channel < 3; channel += 1) {
          rowErrors[errorOffset + direction * 3 + channel] += (error * 7) / 16;
          nextErrors[errorOffset - direction * 3 + channel] += (error * 3) / 16;
          nextErrors[errorOffset + channel] += (error * 5) / 16;
          nextErrors[errorOffset + direction * 3 + channel] += (error * 1) / 16;
        }
        continue;
      }
      const direction = reverse ? -1 : 1;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[offset + channel] / 255 + rowErrors[errorOffset + channel];
        const quantized = quantize(value);
        data[offset + channel] = Math.round(quantized * 255);
        const error = value - quantized;
        rowErrors[errorOffset + direction * 3 + channel] += (error * 7) / 16;
        nextErrors[errorOffset - direction * 3 + channel] += (error * 3) / 16;
        nextErrors[errorOffset + channel] += (error * 5) / 16;
        nextErrors[errorOffset + direction * 3 + channel] += (error * 1) / 16;
      }
    }
    rowErrors.set(nextErrors);
  }
}

/**
 * Apply one non-destructive texture effect to sRGB RGBA bytes.
 *
 * Alpha is always preserved. Lighting is not modified here; an effect layer
 * processes whatever composite is below it in the stack.
 */
export function applyTextureEffect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: TextureEffect
): void {
  if (effect.type === 'tone') {
    const lut = toneLut(effect);
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = lut[data[offset]];
      data[offset + 1] = lut[data[offset + 1]];
      data[offset + 2] = lut[data[offset + 2]];
    }
    return;
  }
  if (effect.type === 'posterize') {
    const lut = posterizeLut(Math.max(2, Math.round(effect.levels)));
    for (let offset = 0; offset < data.length; offset += 4) {
      data[offset] = lut[data[offset]];
      data[offset + 1] = lut[data[offset + 1]];
      data[offset + 2] = lut[data[offset + 2]];
    }
    return;
  }
  applyDither(data, width, height, effect);
}
