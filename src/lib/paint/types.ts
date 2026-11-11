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
}
