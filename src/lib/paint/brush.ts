import {
  MAX_PAINT_SPACING,
  MIN_PAINT_SPACING,
  type PaintSettings
} from './types';

type BrushContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Pen tilt in degrees, used to squash the stamp into an ellipse. */
export interface BrushTilt {
  readonly x: number;
  readonly y: number;
}

/** Clamp a value into a closed numeric range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pressure response shared by stamp radius and stamp spacing. */
function pressureRadiusScale(pressure: number): number {
  return 0.35 + clamp(pressure, 0, 1) * 0.65;
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
  context: BrushContext,
  x: number,
  y: number,
  radius: number,
  settings: PaintSettings,
  pressure: number,
  random: () => number,
  erase = false,
  tilt?: BrushTilt
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pressureScale = pressureRadiusScale(pressure);
  const noise = clamp(settings.noise, 0, 1);
  const jitterX = (random() - 0.5) * radius * noise * 0.7;
  const jitterY = (random() - 0.5) * radius * noise * 0.7;
  const sizeJitter = 1 + (random() - 0.5) * noise * 0.45;
  const colorAlpha = erase ? 1 : clamp(settings.colorAlpha ?? 1, 0, 1);
  const alpha =
    clamp(settings.opacity, 0, 1) *
    colorAlpha *
    (0.35 + clamp(pressure, 0, 1) * 0.65) *
    (1 - random() * noise * 0.35);
  const r = Math.max(0.5, radius * pressureScale * sizeJitter);
  const cx = x + jitterX;
  const cy = y + jitterY;
  const hardness = clamp(settings.hardness, 0.01, 1);
  const inner = r * Math.max(0.01, hardness * 0.96);
  const tiltMagnitude = clamp(
    Math.hypot(tilt?.x ?? 0, tilt?.y ?? 0) / 90,
    0,
    1
  );
  const tiltAspect = 1 - tiltMagnitude * 0.55;
  const tiltAngle = Math.atan2(tilt?.y ?? 0, tilt?.x ?? 0);

  context.save();
  context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  context.globalAlpha = clamp(alpha, 0, 1);
  if (tiltMagnitude > 0.01) {
    context.translate(cx, cy);
    context.rotate(tiltAngle);
    context.scale(1, tiltAspect);
  }
  const stampX = tiltMagnitude > 0.01 ? 0 : cx;
  const stampY = tiltMagnitude > 0.01 ? 0 : cy;
  if (hardness >= 0.995) {
    context.fillStyle = erase ? '#000000' : settings.color;
    context.beginPath();
    context.arc(stampX, stampY, r, 0, Math.PI * 2);
    context.fill();
  } else {
    const gradient = context.createRadialGradient(
      stampX,
      stampY,
      inner,
      stampX,
      stampY,
      r
    );
    const color = erase ? '0,0,0' : hexRgb(settings.color);
    gradient.addColorStop(0, `rgba(${color},${alpha})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    context.globalAlpha = 1;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(stampX, stampY, r, 0, Math.PI * 2);
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
  context: BrushContext,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  radius: number,
  settings: PaintSettings,
  pressure: number,
  random: () => number,
  erase = false,
  tilt?: BrushTilt
): { minX: number; minY: number; maxX: number; maxY: number } {
  const length = Math.hypot(toX - fromX, toY - fromY);
  // Blend pressure-scaled spacing with the nominal diameter. Pure
  // pressure-scaled spacing keeps light strokes dense but multiplied the
  // number of radial-gradient stamps on every Pencil stroke. The blend closes
  // the visual gaps while capping the density increase to about 1.4×.
  const fraction = clamp(settings.spacing, MIN_PAINT_SPACING, MAX_PAINT_SPACING);
  const stableSpacing = radius * 2 * fraction;
  const pressureSpacing = radius * pressureRadiusScale(pressure) * 2 * fraction;
  const spacing = Math.max(1, (stableSpacing + pressureSpacing) * 0.5);
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
      erase,
      tilt
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

/** Convert a hex color and alpha value into a Canvas/SVG CSS color. */
export function rgbaColor(color: string, alpha: number): string {
  return `rgba(${hexRgb(color)},${clamp(alpha, 0, 1)})`;
}
