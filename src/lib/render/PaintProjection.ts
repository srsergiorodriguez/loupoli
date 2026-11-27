/** Non-indexed render triangles prepared for a UV-space paint projection. */
export interface ProjectedPaintMesh {
  /** Per vertex: U, V, NDC X, NDC Y, NDC Z, clip W. */
  readonly data: Float32Array;
  readonly vertexCount: number;
}
