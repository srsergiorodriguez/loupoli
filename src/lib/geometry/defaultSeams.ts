import type { HalfEdgeMesh } from './HalfEdgeMesh';
import type { PrimitiveKind } from './primitives';

function setSeamBetweenPatches(
  mesh: HalfEdgeMesh,
  patchByFace: Int32Array,
  first: number,
  second: number,
  seam: boolean
): void {
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    const halfEdge = mesh.edgeHalfEdge[edge];
    const twin = mesh.heTwin[halfEdge];
    if (twin < 0) {
      continue;
    }
    const a = mesh.heFace[halfEdge];
    const b = mesh.heFace[twin];
    if (
      a >= 0 &&
      b >= 0 &&
      ((patchByFace[a] === first && patchByFace[b] === second) ||
        (patchByFace[a] === second && patchByFace[b] === first))
    ) {
      mesh.setEdgeSeam(edge, seam);
    }
  }
}

/** Assign the default UV seam profile for a newly created primitive. */
export function applyDefaultSeams(
  mesh: HalfEdgeMesh,
  kind: PrimitiveKind
): void {
  if (kind === 'grid') {
    return;
  }
  const faceCount = mesh.faceCount;
  const patchByFace = new Int32Array(faceCount);
  if (kind === 'cube') {
    patchByFace.set(Array.from({ length: faceCount }, (_, index) => index));
  } else if (kind === 'quadsphere') {
    const patchSize = Math.max(1, Math.ceil(faceCount / 6));
    for (let face = 0; face < faceCount; face += 1) {
      patchByFace[face] = Math.min(5, Math.floor(face / patchSize));
    }
  } else {
    const sideFaces = Math.max(1, faceCount - 2);
    patchByFace.fill(0);
    if (faceCount > 0) {
      patchByFace[faceCount - 1] = 1;
    }
    if (faceCount > 1) {
      patchByFace[faceCount - 2] = 2;
    }
    for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
      const halfEdge = mesh.edgeHalfEdge[edge];
      const twin = mesh.heTwin[halfEdge];
      if (twin < 0) {
        continue;
      }
      const a = mesh.heFace[halfEdge];
      const b = mesh.heFace[twin];
      if (
        a >= 0 &&
        b >= 0 &&
        a < sideFaces &&
        b < sideFaces &&
        ((a === 0 && b === sideFaces - 1) ||
          (b === 0 && a === sideFaces - 1))
      ) {
        mesh.setEdgeSeam(edge, true);
      }
    }
  }
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    const halfEdge = mesh.edgeHalfEdge[edge];
    const twin = mesh.heTwin[halfEdge];
    if (twin < 0) {
      continue;
    }
    const a = mesh.heFace[halfEdge];
    const b = mesh.heFace[twin];
    if (a >= 0 && b >= 0 && patchByFace[a] !== patchByFace[b]) {
      mesh.setEdgeSeam(edge, true);
    }
  }
  // Keep enough face connections to unfold each closed volume into one net.
  const net =
    kind === 'cube'
      ? [
          [0, 2],
          [1, 2],
          [2, 3],
          [2, 5],
          [4, 5]
        ]
      : kind === 'quadsphere'
        ? [
            [0, 2],
            [0, 3],
            [0, 4],
            [2, 5],
            [1, 2]
          ]
        : [];
  for (const [first, second] of net) {
    setSeamBetweenPatches(mesh, patchByFace, first, second, false);
  }
}
