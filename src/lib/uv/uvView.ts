import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';

/** User zoom/pan applied after fitting the mesh UV bounds. */
export interface UvViewState {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

/** Maps UV space to a canvas pixel rectangle while preserving aspect ratio. */
export interface UvProjection {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

/** Convert UV coordinates to canvas pixels. */
export function uvToCanvas(
  uv: Vec2,
  projection: UvProjection
): { x: number; y: number } {
  return {
    x: projection.offsetX + uv[0] * projection.scale,
    y: projection.height - projection.offsetY - uv[1] * projection.scale
  };
}

/** Convert a canvas-pixel delta into UV units. */
export function canvasDeltaToUv(
  dx: number,
  dy: number,
  projection: UvProjection
): [number, number] {
  return [dx / projection.scale, -dy / projection.scale];
}

/**
 * Fit the mesh UV bounds into the available canvas with padding.
 *
 * The projection is uniform so UV squares stay square. UVs outside [0,1] are
 * supported because tiled materials legitimately repeat coordinates.
 */
export function computeUvProjection(
  mesh: HalfEdgeMesh,
  width: number,
  height: number,
  padding = 24,
  view?: UvViewState
): UvProjection {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let halfEdge = 0; halfEdge < mesh.halfEdgeCount; halfEdge += 1) {
    const offset = halfEdge * 2;
    const u = mesh.heUv[offset];
    const v = mesh.heUv[offset + 1];
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      continue;
    }
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  if (!Number.isFinite(minU)) {
    minU = 0;
    minV = 0;
    maxU = 1;
    maxV = 1;
  }
  const spanU = Math.max(maxU - minU, 1e-6);
  const spanV = Math.max(maxV - minV, 1e-6);
  const scale = Math.max(
    1e-6,
    Math.min(
      Math.max(width - padding * 2, 1) / spanU,
      Math.max(height - padding * 2, 1) / spanV
    )
  );
  const baseOffsetX = (width - spanU * scale) / 2 - minU * scale;
  const baseOffsetY = (height - spanV * scale) / 2 - minV * scale;
  const zoom = Math.max(0.01, view?.zoom ?? 1);
  return {
    scale: scale * zoom,
    offsetX: baseOffsetX + (view?.panX ?? 0),
    offsetY: baseOffsetY + (view?.panY ?? 0),
    width,
    height
  };
}

/**
 * Pick the nearest per-corner UV within the 16 CSS px tolerance.
 *
 * Corners are the editable UV unit, so adjacent face corners with identical
 * coordinates remain distinct selection candidates.
 */
export function pickUvCorner(
  mesh: HalfEdgeMesh,
  x: number,
  y: number,
  projection: UvProjection,
  radius = 16
): number | null {
  const radiusSq = radius * radius;
  let best: number | null = null;
  let bestDistanceSq = radiusSq;
  for (let halfEdge = 0; halfEdge < mesh.halfEdgeCount; halfEdge += 1) {
    const offset = halfEdge * 2;
    const point = uvToCanvas(
      [mesh.heUv[offset], mesh.heUv[offset + 1]],
      projection
    );
    const distanceSq = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = halfEdge;
    }
  }
  return best;
}

/**
 * Convert a side-pane pointer X into the viewport split fraction.
 *
 * The pane's right gutter is accounted for so grabbing the divider does not
 * jump the pane on the first move.
 */
export function uvSideSplitForPointer(
  viewportRight: number,
  rightGutter: number,
  pointerX: number,
  viewportWidth: number
): number {
  if (viewportWidth <= 0) {
    return 0.38;
  }
  return (viewportRight - rightGutter - pointerX) / viewportWidth;
}

/** Whether a pointer moved far enough to stop being a click. */
export function uvClickMoved(
  startX: number,
  startY: number,
  x: number,
  y: number,
  threshold = 4
): boolean {
  return Math.hypot(x - startX, y - startY) > threshold;
}
