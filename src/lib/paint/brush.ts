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

/** Cached pre-rendered brush stamp; creating a radial gradient per dab is costly. */
const STAMP_SPRITES = new Map<string, HTMLCanvasElement>();
const MAX_STAMP_SPRITES = 6;

/**
 * Build or reuse an opaque colored stamp sprite.
 *
 * The sprite is rendered once per color/hardness/radius and then drawn with
 * globalAlpha and pressure scaling. This removes createRadialGradient and path
 * construction from the per-stamp Pencil hot path.
 */
function stampSprite(
  settings: PaintSettings,
  erase: boolean
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const radius = Math.max(1, Math.min(512, Math.ceil(settings.radius)));
  const hardness = Math.min(1, Math.max(0.01, settings.hardness));
  const key = `${erase ? 'e' : 'c'}:${settings.color}:${hardness}:${radius}`;
  const cached = STAMP_SPRITES.get(key);
  if (cached) {
    return cached;
  }
  const canvas = document.createElement('canvas');
  const size = radius * 2 + 2;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const center = size / 2;
  const rgb = erase ? '0,0,0' : hexRgb(settings.color);
  context.clearRect(0, 0, size, size);
  if (hardness >= 0.995) {
    context.fillStyle = erase ? '#000000' : settings.color;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
  } else {
    const gradient = context.createRadialGradient(
      center,
      center,
      radius * Math.max(0.01, hardness * 0.96),
      center,
      center,
      radius
    );
    gradient.addColorStop(0, `rgba(${rgb},1)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
  }
  if (STAMP_SPRITES.size >= MAX_STAMP_SPRITES) {
    const oldest = STAMP_SPRITES.keys().next().value;
    if (oldest !== undefined) {
      STAMP_SPRITES.delete(oldest);
    }
  }
  STAMP_SPRITES.set(key, canvas);
  return canvas;
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
  const sprite = stampSprite(settings, erase);
  if (sprite) {
    const nominalRadius = Math.max(1, Math.min(512, Math.ceil(settings.radius)));
    const padding = r / nominalRadius;
    const drawOffset = -r - padding;
    const drawSize = r * 2 + padding * 2;
    if (tiltMagnitude > 0.01) {
      context.translate(cx, cy);
      context.rotate(tiltAngle);
      context.scale(1, tiltAspect);
      context.drawImage(sprite, drawOffset, drawOffset, drawSize, drawSize);
    } else {
      context.drawImage(
        sprite,
        cx + drawOffset,
        cy + drawOffset,
        drawSize,
        drawSize
      );
    }
  } else if (hardness >= 0.995) {
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
  tilt?: BrushTilt,
  pressureTo = pressure,
  tiltTo?: BrushTilt
): { minX: number; minY: number; maxX: number; maxY: number } {
  const length = Math.hypot(toX - fromX, toY - fromY);
  // Space dabs by the pressure-adjusted diameter so the overlap ratio stays
  // constant. Cached stamp sprites make these extra dabs inexpensive; using
  // the nominal diameter here leaves visible bead edges on light strokes.
  const fraction = clamp(settings.spacing, MIN_PAINT_SPACING, MAX_PAINT_SPACING);
  const minPressure = Math.min(pressure, pressureTo);
  const spacing = Math.max(
    1,
    radius * pressureRadiusScale(minPressure) * 2 * fraction
  );
  const steps = Math.max(1, Math.ceil(length / spacing));
  const fromTilt = tilt ?? { x: 0, y: 0 };
  const endTilt = tiltTo ?? fromTilt;
  let bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const stampPressure = pressure + (pressureTo - pressure) * t;
    const stampTilt = {
      x: fromTilt.x + (endTilt.x - fromTilt.x) * t,
      y: fromTilt.y + (endTilt.y - fromTilt.y) * t
    };
    const stamp = drawStamp(
      context,
      fromX + (toX - fromX) * t,
      fromY + (toY - fromY) * t,
      radius,
      settings,
      stampPressure,
      random,
      erase,
      stampTilt
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
