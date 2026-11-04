/** One frontmost surface hit mapped to the active render mesh and its UVs. */
export interface SurfaceHit {
  readonly nodeId: string;
  readonly face: number;
  readonly triangle: number;
  readonly uv: readonly [number, number];
  readonly point: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly distance: number;
  /** Approximate UV span per CSS pixel at the hit, used for brush sizing. */
  readonly uvPerCssPixel: number;
}
