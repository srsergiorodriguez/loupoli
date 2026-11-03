import type { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import { buildUvTopology, type UvSelectionMode } from './uvElements';
import {
  computeUvProjection,
  uvToCanvas,
  type UvProjection,
  type UvViewState
} from './uvView';

function cssToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function faceCorners(mesh: HalfEdgeMesh, face: number): number[] {
  const corners: number[] = [];
  const start = mesh.faceHalfEdge[face];
  let halfEdge = start;
  do {
    corners.push(halfEdge);
    halfEdge = mesh.heNext[halfEdge];
  } while (halfEdge !== start && corners.length <= mesh.halfEdgeCount);
  return corners;
}

/**
 * Draw the editable UV layout into a 2D canvas.
 *
 * The DCEL remains the source of truth; this function is a view of per-corner
 * UVs and selected corner indices. It is called only when UV state or the
 * canvas size changes, never from a continuous animation loop.
 */
export function drawUvCanvas(
  canvas: HTMLCanvasElement,
  mesh: HalfEdgeMesh,
  selected: ReadonlySet<number>,
  pinned: ReadonlySet<number>,
  width: number,
  height: number,
  backgroundImage: CanvasImageSource | null = null,
  view?: UvViewState,
  selectionMode: UvSelectionMode = 'vertex',
  projectionOverride?: UvProjection
): void {
  if (width <= 0 || height <= 0) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const background = cssToken('--bg-panel-strong', '#1a1a1f');
  const border = cssToken('--border-subtle', 'rgba(255,255,255,.08)');
  const wire = cssToken('--wireframe-edge', 'rgba(242,239,230,.26)');
  const seam = cssToken('--accent-warning', '#ffb45e');
  const accent = cssToken('--accent-primary', '#c9f45c');
  const pin = cssToken('--accent-secondary', '#8f8ff8');
  const text = cssToken('--text-tertiary', '#8e8c96');

  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const projection =
    projectionOverride ?? computeUvProjection(mesh, width, height, 26, view);
  if (backgroundImage) {
    const imageOrigin = uvToCanvas([0, 1], projection);
    context.save();
    context.globalAlpha = 0.58;
    context.drawImage(
      backgroundImage,
      imageOrigin.x,
      imageOrigin.y,
      projection.scale,
      projection.scale
    );
    context.restore();
  }
  const toPoint = (u: number, v: number): [number, number] => {
    const point = uvToCanvas([u, v], projection);
    return [point.x, point.y];
  };

  // A subtle unit square makes tiled UVs and negative coordinates legible.
  const [originX, originY] = toPoint(0, 1);
  context.strokeStyle = border;
  context.lineWidth = 1;
  context.setLineDash([3, 4]);
  context.strokeRect(originX, originY, projection.scale, projection.scale);
  context.setLineDash([]);

  // Faces first: selected faces read as a soft lime wash.
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const corners = faceCorners(mesh, face);
    if (corners.length < 3) {
      continue;
    }
    context.beginPath();
    for (let index = 0; index < corners.length; index += 1) {
      const corner = corners[index];
      const u = mesh.heUv[corner * 2];
      const v = mesh.heUv[corner * 2 + 1];
      const [x, y] = toPoint(u, v);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.closePath();
    const faceSelected = corners.every((corner) => selected.has(corner));
    if (faceSelected) {
      context.fillStyle = 'rgba(201, 244, 92, 0.16)';
      context.fill();
    }
    context.strokeStyle = wire;
    context.lineWidth = 1;
    context.stroke();
  }

  // Marked seams stay visible above the chart wire.
  context.strokeStyle = seam;
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.beginPath();
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    if (!mesh.isEdgeSeam(edge)) {
      continue;
    }
    const halfEdge = mesh.edgeHalfEdge[edge];
    const from = toPoint(
      mesh.heUv[halfEdge * 2],
      mesh.heUv[halfEdge * 2 + 1]
    );
    const destination = mesh.heNext[halfEdge];
    const to = toPoint(
      mesh.heUv[destination * 2],
      mesh.heUv[destination * 2 + 1]
    );
    context.moveTo(from[0], from[1]);
    context.lineTo(to[0], to[1]);
  }
  context.stroke();

  // Draw each unique UV location once as a small corner dot.
  const seen = new Set<string>();
  context.fillStyle = text;
  for (let halfEdge = 0; halfEdge < mesh.halfEdgeCount; halfEdge += 1) {
    const u = mesh.heUv[halfEdge * 2];
    const v = mesh.heUv[halfEdge * 2 + 1];
    const key = `${u.toFixed(5)}|${v.toFixed(5)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const [x, y] = toPoint(u, v);
    context.beginPath();
    context.arc(x, y, 1.4, 0, Math.PI * 2);
    context.fill();
  }

  // In edge mode, draw selected UV edges before the point handles. A UV edge
  // is identified by its two UV points, not by the underlying mesh edge.
  if (selectionMode === 'edge') {
    const topology = buildUvTopology(mesh);
    context.strokeStyle = accent;
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    for (const edge of topology.edges) {
      if (
        !edge.aCorners.every((corner) => selected.has(corner)) ||
        !edge.bCorners.every((corner) => selected.has(corner))
      ) {
        continue;
      }
      const a = toPoint(edge.uvA[0], edge.uvA[1]);
      const b = toPoint(edge.uvB[0], edge.uvB[1]);
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.stroke();
    }
  }

  // Selected corners are the editable units and must remain distinct.
  for (const corner of selected) {
    if (corner < 0 || corner >= mesh.halfEdgeCount) {
      continue;
    }
    const [x, y] = toPoint(
      mesh.heUv[corner * 2],
      mesh.heUv[corner * 2 + 1]
    );
    context.beginPath();
    context.arc(x, y, 4.2, 0, Math.PI * 2);
    context.fillStyle = accent;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = background;
    context.stroke();
  }

  for (const corner of pinned) {
    if (corner < 0 || corner >= mesh.halfEdgeCount) {
      continue;
    }
    const [x, y] = toPoint(
      mesh.heUv[corner * 2],
      mesh.heUv[corner * 2 + 1]
    );
    context.beginPath();
    context.arc(x, y, 6.5, 0, Math.PI * 2);
    context.lineWidth = 2;
    context.strokeStyle = pin;
    context.stroke();
    context.beginPath();
    context.moveTo(x - 2.5, y);
    context.lineTo(x + 2.5, y);
    context.moveTo(x, y - 2.5);
    context.lineTo(x, y + 2.5);
    context.lineWidth = 1.5;
    context.stroke();
  }
}
