/**
 * Write extrusion normals for an inverted-hull outline.
 *
 * Render vertices are split at UV seams and hard edges for flat shading, so
 * extruding each triangle along its own face normal tears the hull apart at
 * every sharp corner. Outline normals are averaged at coincident positions
 * instead; an inverted hull is not shaded, so the smoothed directions only
 * affect the silhouette.
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

  const vertexCount = positions.length / 3;
  const slotByPosition = new Map<string, number>();
  const sums: number[] = [];
  const minDots: number[] = [];

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    let slot = slotByPosition.get(key);
    if (slot === undefined) {
      slot = sums.length / 3;
      slotByPosition.set(key, slot);
      sums.push(0, 0, 0);
      minDots.push(1);
    }
    const sumOffset = slot * 3;
    sums[sumOffset] += normals[offset];
    sums[sumOffset + 1] += normals[offset + 1];
    sums[sumOffset + 2] += normals[offset + 2];
  }

  const slotCount = sums.length / 3;
  const slotNormals = new Float32Array(slotCount * 3);
  for (let slot = 0; slot < slotCount; slot += 1) {
    const offset = slot * 3;
    const length = Math.hypot(sums[offset], sums[offset + 1], sums[offset + 2]);
    if (length < 1e-8) {
      continue;
    }
    slotNormals[offset] = sums[offset] / length;
    slotNormals[offset + 1] = sums[offset + 1] / length;
    slotNormals[offset + 2] = sums[offset + 2] / length;
  }

  // Measure how far each incident face normal is from the averaged normal.
  // The smallest dot product determines the miter needed to keep the offset
  // plane parallel to that face.
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    const slot = slotByPosition.get(key) ?? 0;
    const normalOffset = slot * 3;
    const dot =
      normals[offset] * slotNormals[normalOffset] +
      normals[offset + 1] * slotNormals[normalOffset + 1] +
      normals[offset + 2] * slotNormals[normalOffset + 2];
    if (dot < minDots[slot]) {
      minDots[slot] = dot;
    }
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    const slot = slotByPosition.get(key) ?? 0;
    const normalOffset = slot * 3;
    const nx = slotNormals[normalOffset];
    const ny = slotNormals[normalOffset + 1];
    const nz = slotNormals[normalOffset + 2];
    if (Math.hypot(nx, ny, nz) < 1e-8) {
      outNormals[offset] = normals[offset];
      outNormals[offset + 1] = normals[offset + 1];
      outNormals[offset + 2] = normals[offset + 2];
      continue;
    }
    const miter = Math.min(2, 1 / Math.max(0.5, minDots[slot]));
    outNormals[offset] = nx * miter;
    outNormals[offset + 1] = ny * miter;
    outNormals[offset + 2] = nz * miter;
  }
}
