import type { Vector3 } from 'three';

/** Flat binary BVH over a world-space triangle soup. */
export interface FlatBvh {
  /** Six floats per node: min XYZ, max XYZ. */
  readonly bounds: Float32Array;
  /** Non-negative: left child index. Negative: -(leafStart + 1). */
  readonly leftOrStart: Int32Array;
  /** Inner node: right child index. Leaf: triangle count. */
  readonly rightOrCount: Int32Array;
  /** Nine floats per triangle in leaf order. */
  readonly triangles: Float32Array;
  /** Per-instance traversal stack, reused between rays. */
  readonly stack: Int32Array;
}

/** Scalar Möller–Trumbore intersection, matching the linear bake path. */
export function rayHitsTriangle(
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  maxDistance: number
): boolean {
  const edge1X = bx - ax;
  const edge1Y = by - ay;
  const edge1Z = bz - az;
  const edge2X = cx - ax;
  const edge2Y = cy - ay;
  const edge2Z = cz - az;
  const pX = directionY * edge2Z - directionZ * edge2Y;
  const pY = directionZ * edge2X - directionX * edge2Z;
  const pZ = directionX * edge2Y - directionY * edge2X;
  const determinant = edge1X * pX + edge1Y * pY + edge1Z * pZ;
  if (Math.abs(determinant) < 1e-9) {
    return false;
  }
  const inverse = 1 / determinant;
  const tX = originX - ax;
  const tY = originY - ay;
  const tZ = originZ - az;
  const u = (tX * pX + tY * pY + tZ * pZ) * inverse;
  if (u < 0 || u > 1) {
    return false;
  }
  const qX = tY * edge1Z - tZ * edge1Y;
  const qY = tZ * edge1X - tX * edge1Z;
  const qZ = tX * edge1Y - tY * edge1X;
  const v = (directionX * qX + directionY * qY + directionZ * qZ) * inverse;
  if (v < 0 || u + v > 1) {
    return false;
  }
  const distance = (edge2X * qX + edge2Y * qY + edge2Z * qZ) * inverse;
  return distance > 1e-4 && distance < maxDistance;
}

/** Build a median-split BVH over the supplied world-space triangle arrays. */
export function buildFlatBvh(
  occluders: readonly Float32Array[]
): FlatBvh {
  let totalTriangles = 0;
  for (const triangles of occluders) {
    totalTriangles += Math.floor(triangles.length / 9);
  }
  if (totalTriangles === 0) {
    return {
      bounds: new Float32Array(0),
      leftOrStart: new Int32Array(0),
      rightOrCount: new Int32Array(0),
      triangles: new Float32Array(0),
      stack: new Int32Array(64)
    };
  }

  const rawTriangles = new Float32Array(totalTriangles * 9);
  const centroids = new Float32Array(totalTriangles * 3);
  const triangleBounds = new Float32Array(totalTriangles * 6);
  const indices = new Int32Array(totalTriangles);
  let cursor = 0;
  for (const triangles of occluders) {
    for (let offset = 0; offset + 8 < triangles.length; offset += 9) {
      const ax = triangles[offset];
      const ay = triangles[offset + 1];
      const az = triangles[offset + 2];
      const bx = triangles[offset + 3];
      const by = triangles[offset + 4];
      const bz = triangles[offset + 5];
      const cx = triangles[offset + 6];
      const cy = triangles[offset + 7];
      const cz = triangles[offset + 8];
      const triangleOffset = cursor * 9;
      rawTriangles.set(
        [ax, ay, az, bx, by, bz, cx, cy, cz],
        triangleOffset
      );
      const centroidOffset = cursor * 3;
      centroids[centroidOffset] = (ax + bx + cx) / 3;
      centroids[centroidOffset + 1] = (ay + by + cy) / 3;
      centroids[centroidOffset + 2] = (az + bz + cz) / 3;
      const boundsOffset = cursor * 6;
      triangleBounds[boundsOffset] = Math.min(ax, bx, cx);
      triangleBounds[boundsOffset + 1] = Math.min(ay, by, cy);
      triangleBounds[boundsOffset + 2] = Math.min(az, bz, cz);
      triangleBounds[boundsOffset + 3] = Math.max(ax, bx, cx);
      triangleBounds[boundsOffset + 4] = Math.max(ay, by, cy);
      triangleBounds[boundsOffset + 5] = Math.max(az, bz, cz);
      indices[cursor] = cursor;
      cursor += 1;
    }
  }

  const maxNodes = Math.max(1, totalTriangles * 2);
  const bounds = new Float32Array(maxNodes * 6);
  const leftOrStart = new Int32Array(maxNodes);
  const rightOrCount = new Int32Array(maxNodes);
  let nodeCount = 0;

  const buildNode = (start: number, end: number): number => {
    const node = nodeCount;
    nodeCount += 1;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let centroidMinX = Infinity;
    let centroidMinY = Infinity;
    let centroidMinZ = Infinity;
    let centroidMaxX = -Infinity;
    let centroidMaxY = -Infinity;
    let centroidMaxZ = -Infinity;
    for (let i = start; i < end; i += 1) {
      const triangleIndex = indices[i];
      const boundsOffset = triangleIndex * 6;
      minX = Math.min(minX, triangleBounds[boundsOffset]);
      minY = Math.min(minY, triangleBounds[boundsOffset + 1]);
      minZ = Math.min(minZ, triangleBounds[boundsOffset + 2]);
      maxX = Math.max(maxX, triangleBounds[boundsOffset + 3]);
      maxY = Math.max(maxY, triangleBounds[boundsOffset + 4]);
      maxZ = Math.max(maxZ, triangleBounds[boundsOffset + 5]);
      const centroidOffset = triangleIndex * 3;
      centroidMinX = Math.min(centroidMinX, centroids[centroidOffset]);
      centroidMinY = Math.min(centroidMinY, centroids[centroidOffset + 1]);
      centroidMinZ = Math.min(centroidMinZ, centroids[centroidOffset + 2]);
      centroidMaxX = Math.max(centroidMaxX, centroids[centroidOffset]);
      centroidMaxY = Math.max(centroidMaxY, centroids[centroidOffset + 1]);
      centroidMaxZ = Math.max(centroidMaxZ, centroids[centroidOffset + 2]);
    }
    const nodeBoundsOffset = node * 6;
    bounds[nodeBoundsOffset] = minX;
    bounds[nodeBoundsOffset + 1] = minY;
    bounds[nodeBoundsOffset + 2] = minZ;
    bounds[nodeBoundsOffset + 3] = maxX;
    bounds[nodeBoundsOffset + 4] = maxY;
    bounds[nodeBoundsOffset + 5] = maxZ;
    const count = end - start;
    if (count <= 4) {
      leftOrStart[node] = -(start + 1);
      rightOrCount[node] = count;
      return node;
    }
    const extentX = centroidMaxX - centroidMinX;
    const extentY = centroidMaxY - centroidMinY;
    const extentZ = centroidMaxZ - centroidMinZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
    const split =
      axis === 0
        ? (centroidMinX + centroidMaxX) * 0.5
        : axis === 1
          ? (centroidMinY + centroidMaxY) * 0.5
          : (centroidMinZ + centroidMaxZ) * 0.5;
    let middle = start;
    for (let i = start; i < end; i += 1) {
      if (centroids[indices[i] * 3 + axis] < split) {
        const temporary = indices[i];
        indices[i] = indices[middle];
        indices[middle] = temporary;
        middle += 1;
      }
    }
    if (middle === start || middle === end) {
      middle = start + (count >> 1);
    }
    const left = buildNode(start, middle);
    const right = buildNode(middle, end);
    leftOrStart[node] = left;
    rightOrCount[node] = right;
    return node;
  };

  buildNode(0, totalTriangles);
  const orderedTriangles = new Float32Array(totalTriangles * 9);
  for (let i = 0; i < totalTriangles; i += 1) {
    const source = indices[i] * 9;
    orderedTriangles.set(
      rawTriangles.subarray(source, source + 9),
      i * 9
    );
  }
  return {
    bounds: bounds.slice(0, nodeCount * 6),
    leftOrStart: leftOrStart.slice(0, nodeCount),
    rightOrCount: rightOrCount.slice(0, nodeCount),
    triangles: orderedTriangles,
    stack: new Int32Array(64)
  };
}

/** Any-hit BVH query without heap allocation per ray. */
export function bvhRayOccluded(
  bvh: FlatBvh,
  origin: Vector3,
  direction: Vector3,
  maxDistance: number
): boolean {
  const { bounds, leftOrStart, rightOrCount, triangles, stack } = bvh;
  if (leftOrStart.length === 0) {
    return false;
  }
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const inverseX = Math.abs(dx) > 1e-12 ? 1 / dx : dx >= 0 ? 1e12 : -1e12;
  const inverseY = Math.abs(dy) > 1e-12 ? 1 / dy : dy >= 0 ? 1e12 : -1e12;
  const inverseZ = Math.abs(dz) > 1e-12 ? 1 / dz : dz >= 0 ? 1e12 : -1e12;
  let stackPointer = 0;
  stack[stackPointer++] = 0;
  while (stackPointer > 0) {
    const node = stack[--stackPointer];
    const offset = node * 6;
    const tx1 = (bounds[offset] - ox) * inverseX;
    const tx2 = (bounds[offset + 3] - ox) * inverseX;
    let tMin = Math.min(tx1, tx2);
    let tMax = Math.max(tx1, tx2);
    const ty1 = (bounds[offset + 1] - oy) * inverseY;
    const ty2 = (bounds[offset + 4] - oy) * inverseY;
    tMin = Math.max(tMin, Math.min(ty1, ty2));
    tMax = Math.min(tMax, Math.max(ty1, ty2));
    const tz1 = (bounds[offset + 2] - oz) * inverseZ;
    const tz2 = (bounds[offset + 5] - oz) * inverseZ;
    tMin = Math.max(tMin, Math.min(tz1, tz2));
    tMax = Math.min(tMax, Math.max(tz1, tz2));
    if (tMax < Math.max(1e-4, tMin) || tMin >= maxDistance) {
      continue;
    }
    const left = leftOrStart[node];
    if (left < 0) {
      const start = -left - 1;
      const count = rightOrCount[node];
      for (let i = 0; i < count; i += 1) {
        const triangleOffset = (start + i) * 9;
        if (
          rayHitsTriangle(
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            triangles[triangleOffset],
            triangles[triangleOffset + 1],
            triangles[triangleOffset + 2],
            triangles[triangleOffset + 3],
            triangles[triangleOffset + 4],
            triangles[triangleOffset + 5],
            triangles[triangleOffset + 6],
            triangles[triangleOffset + 7],
            triangles[triangleOffset + 8],
            maxDistance
          )
        ) {
          return true;
        }
      }
    } else {
      if (stackPointer + 2 > stack.length) {
        throw new Error('The BVH traversal stack overflowed.');
      }
      stack[stackPointer++] = rightOrCount[node];
      stack[stackPointer++] = left;
    }
  }
  return false;
}
