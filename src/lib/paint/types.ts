/** Paint tools implemented by the raster paint engine. */
export type PaintTool =
  | 'brush'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'gradient'
  | 'fill';

/** Gradient direction options. */
export type PaintGradient = 'linear' | 'radial';

/** Minimum stamp spacing as a fraction of the brush diameter. */
export const MIN_PAINT_SPACING = 0.02;

/** Maximum stamp spacing as a fraction of the brush diameter. */
export const MAX_PAINT_SPACING = 2;

/** Default stamp spacing: one stamp every quarter of the brush diameter. */
export const DEFAULT_PAINT_SPACING = 0.25;

/** Complete brush/tool settings for one paint gesture. */
export interface PaintSettings {
  readonly tool: PaintTool;
  readonly color: string;
  readonly colorAlpha: number;
  readonly secondaryColor: string;
  readonly secondaryColorAlpha: number;
  readonly radius: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly smoothing: number;
  readonly noise: number;
  /** Whether Pencil pressure also modulates per-dab opacity. */
  readonly pressureOpacity: boolean;
  /** Pressure response exponent for size and optional opacity. */
  readonly pressureCurve: number;
  /** Minimum size/opacity response at zero pressure. */
  readonly pressureMin: number;
  /** Whether Pencil tilt shapes the stamp. */
  readonly tiltEnabled: boolean;
  /** Start taper distance in texture pixels; zero disables it. */
  readonly taperIn: number;
  /** Distance between stamps as a fraction of the pressure-adjusted diameter. */
  readonly spacing: number;
  readonly shapeFilled: boolean;
  readonly gradient: PaintGradient;
}

/** One pointer sample in texture-pixel coordinates. */
export interface PaintSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  /** Projected surface face, used for per-face stroke continuity. */
  readonly surfaceKey?: number;
}

/** Normalize pointer pressure into the range used by every paint surface. */
export function paintPressure(pointerType: string, pressure: number): number {
  if (pointerType !== 'pen') {
    return 1;
  }
  if (!Number.isFinite(pressure) || pressure <= 0) {
    return 0.5;
  }
  return Math.min(1, Math.max(0.1, pressure));
}
