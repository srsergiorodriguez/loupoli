/**
 * Write extrusion normals for an inverted-hull outline.
 *
 * Render vertices are split at UV seams and hard edges for flat shading, so
 * extruding each triangle along its own face normal tears the hull apart at
 * every sharp corner. Outline normals are averaged at coincident positions
 * instead; an inverted hull is not shaded, so the smoothed directions only
 * affect the silhouette.
 *
 * Face normals are deduplicated per position before averaging. Quad fan
 * tessellation emits a different number of triangles at each corner, so
 * counting triangles would weight one adjacent face more than another and
 * rotate the outline at an otherwise symmetric hard corner.
 *
 * The vector keeps a miter scale: normalizing the averaged normal would move a
 * hard corner inside the intersection of its offset face planes, rounding the
 * hull away from the model edge. The scale restores that plane intersection
 * (roughly 1.4–2x at hard creases and 1.0x on a smooth surface). It is capped to
 * avoid spikes at very acute creases.
 *
 * Falls back to the source normal when opposite faces cancel out (for example,
 * coincident double-sided cards).
 */
export function writeSmoothedOutlineNormals(
  positions: Float32Array,
  normals: Float32Array,
  outNormals: Float32Array
): void {
  if (
    positions.length !== normals.length ||
    positions.length !== outNormals.length ||
    positions.length % 3 !== 0
  ) {
    throw new Error('Outline normal buffers must have matching lengths.');
  }

  interface Bucket {
    readonly normals: Map<string, readonly [number, number, number]>;
    output: readonly [number, number, number] | null;
  }

  const vertexCount = positions.length / 3;
  const buckets = new Map<string, Bucket>();

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const positionKey = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    let bucket = buckets.get(positionKey);
    if (!bucket) {
      bucket = { normals: new Map(), output: null };
      buckets.set(positionKey, bucket);
    }
    const nx = normals[offset];
    const ny = normals[offset + 1];
    const nz = normals[offset + 2];
    const normalKey = `${nx.toFixed(5)},${ny.toFixed(5)},${nz.toFixed(5)}`;
    if (!bucket.normals.has(normalKey)) {
      bucket.normals.set(normalKey, [nx, ny, nz]);
    }
  }

  for (const bucket of buckets.values()) {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    for (const normal of bucket.normals.values()) {
      sumX += normal[0];
      sumY += normal[1];
      sumZ += normal[2];
    }
    const length = Math.hypot(sumX, sumY, sumZ);
    if (length < 1e-8) {
      continue;
    }
    const nx = sumX / length;
    const ny = sumY / length;
    const nz = sumZ / length;
    let minDot = 1;
    for (const normal of bucket.normals.values()) {
      const dot = nx * normal[0] + ny * normal[1] + nz * normal[2];
      if (dot < minDot) {
        minDot = dot;
      }
    }
    const miter = Math.min(2, 1 / Math.max(0.5, minDot));
    bucket.output = [nx * miter, ny * miter, nz * miter];
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const positionKey = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    const output = buckets.get(positionKey)?.output;
    if (output) {
      outNormals[offset] = output[0];
      outNormals[offset + 1] = output[1];
      outNormals[offset + 2] = output[2];
    } else {
      outNormals[offset] = normals[offset];
      outNormals[offset + 1] = normals[offset + 1];
      outNormals[offset + 2] = normals[offset + 2];
    }
  }
}
