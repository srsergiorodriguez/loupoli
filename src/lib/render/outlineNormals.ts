/**
 * Write extrusion normals for an inverted-hull outline.
 *
 * Render vertices are split at UV seams and hard edges for flat shading, so
 * extruding each triangle along its own face normal tears the hull apart at
 * every sharp corner. Outline normals are averaged at coincident positions
 * instead; an inverted hull is not shaded, so the smoothed directions only
 * affect the silhouette. Falls back to the source normal when opposite faces
 * cancel out (for example, coincident double-sided cards).
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

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    let slot = slotByPosition.get(key);
    if (slot === undefined) {
      slot = sums.length / 3;
      slotByPosition.set(key, slot);
      sums.push(0, 0, 0);
    }
    const sumOffset = slot * 3;
    sums[sumOffset] += normals[offset];
    sums[sumOffset + 1] += normals[offset + 1];
    sums[sumOffset + 2] += normals[offset + 2];
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = `${positions[offset].toFixed(6)},${positions[offset + 1].toFixed(6)},${positions[offset + 2].toFixed(6)}`;
    const sumOffset = (slotByPosition.get(key) ?? 0) * 3;
    const x = sums[sumOffset];
    const y = sums[sumOffset + 1];
    const z = sums[sumOffset + 2];
    const length = Math.hypot(x, y, z);
    if (length < 1e-8) {
      outNormals[offset] = normals[offset];
      outNormals[offset + 1] = normals[offset + 1];
      outNormals[offset + 2] = normals[offset + 2];
      continue;
    }
    outNormals[offset] = x / length;
    outNormals[offset + 1] = y / length;
    outNormals[offset + 2] = z / length;
  }
}
