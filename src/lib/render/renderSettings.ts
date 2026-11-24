/** Shading choices available to the Render workspace. */
export type RenderShading = 'lit' | 'texture' | 'solid';

/** Upscaling filter used between virtual and output resolution. */
export type RenderUpscale = 'nearest' | 'smooth';

/** Direct-shadow strategy for clean final renders. Preview always uses PCF. */
export type RenderShadowMode = 'pcf' | 'raytraced' | 'baked';

/** Clean still-frame request. Dimensions are explicit and independent of the viewport. */
export interface RenderStillOptions {
  readonly width: number;
  readonly height: number;
  readonly shading: RenderShading;
  readonly shadowMode?: RenderShadowMode;
  readonly camera: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly fov: number;
  };
  readonly transparent: boolean;
  readonly backgroundColor: string;
}
