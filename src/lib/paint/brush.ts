import type { PaintSettings } from './types';

/** Clamp a value into a closed numeric range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic-enough per-stroke random source for grain jitter. */
export function strokeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Draw one brush stamp.
 *
 * Hardness controls the radial falloff. Pressure affects radius and opacity;
 * noise jitters position, size, and alpha per stamp without changing the layer
 * blend mode. Eraser uses destination-out with the same mask.
 */
export function drawStamp(
  context: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  settings: PaintSettings,
  pressure: number,
  random: () => number,
  erase = false
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pressureScale = 0.35 + clamp(pressure, 0, 1) * 0.65;
  const noise = clamp(settings.noise, 0, 1);
  const jitterX = (random() - 0.5) * radius * noise * 0.7;
  const jitterY = (random() - 0.5) * radius * noise * 0.7;
  const sizeJitter = 1 + (random() - 0.5) * noise * 0.45;
  const alpha =
    clamp(settings.opacity, 0, 1) *
    (0.35 + clamp(pressure, 0, 1) * 0.65) *
    (1 - random() * noise * 0.35);
  const r = Math.max(0.5, radius * pressureScale * sizeJitter);
  const cx = x + jitterX;
  const cy = y + jitterY;
  const hardness = clamp(settings.hardness, 0.01, 1);
  const inner = r * Math.max(0.01, hardness * 0.96);

  context.save();
  context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  context.globalAlpha = clamp(alpha, 0, 1);
  if (hardness >= 0.995) {
    context.fillStyle = erase ? '#000000' : settings.color;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
  } else {
    const gradient = context.createRadialGradient(cx, cy, inner, cx, cy, r);
    const color = erase ? '0,0,0' : hexRgb(settings.color);
    gradient.addColorStop(0, `rgba(${color},${alpha})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    context.globalAlpha = 1;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  return {
    minX: cx - r - 1,
    minY: cy - r - 1,
    maxX: cx + r + 1,
    maxY: cy + r + 1
  };
}

/** Draw a stamped line between two texture-space points. */
export function drawStampLine(
  context: OffscreenCanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  settings: PaintSettings,
  pressure: number,
  random: () => number,
  erase = false
): { minX: number; minY: number; maxX: number; maxY: number } {
  const length = Math.hypot(toX - fromX, toY - fromY);
  const spacing = Math.max(1, radius * 2 * clamp(settings.spacing, 0.02, 1));
  const steps = Math.max(1, Math.ceil(length / spacing));
  let bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const stamp = drawStamp(
      context,
      fromX + (toX - fromX) * t,
      fromY + (toY - fromY) * t,
      radius,
      settings,
      pressure,
      random,
      erase
    );
    bounds = {
      minX: Math.min(bounds.minX, stamp.minX),
      minY: Math.min(bounds.minY, stamp.minY),
      maxX: Math.max(bounds.maxX, stamp.maxX),
      maxY: Math.max(bounds.maxY, stamp.maxY)
    };
  }
  return bounds;
}

/** Parse a CSS hex color into an r,g,b triple for gradients. */
function hexRgb(color: string): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) {
    return '255,255,255';
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ].join(',');
}
