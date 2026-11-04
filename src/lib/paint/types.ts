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

/** Complete brush/tool settings for one paint gesture. */
export interface PaintSettings {
  readonly tool: PaintTool;
  readonly color: string;
  readonly secondaryColor: string;
  readonly radius: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly smoothing: number;
  readonly noise: number;
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
