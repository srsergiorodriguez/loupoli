import type { HalfEdgeMesh } from './HalfEdgeMesh';
import { extractUvCharts } from './uvCharts';
import { unwrapUvCharts } from './lscm';

/**
 * Apply the current default seam profile's unwrap to a newly created primitive.
 *
 * Creation owns this step so every default primitive starts with a usable,
 * packed UV layout. Callers that need to preserve a custom layout should not
 * invoke this helper.
 */
export function unwrapDefaultPrimitive(mesh: HalfEdgeMesh): boolean {
  const charts = extractUvCharts(mesh);
  if (charts.length === 0) {
    return false;
  }
  try {
    const uvs = unwrapUvCharts(mesh, charts);
    mesh.setAllCornerUvs(uvs);
    return true;
  } catch {
    // Keep the primitive usable even if a future default chart cannot be
    // flattened; the user can still author seams and invoke Unwrap manually.
    return false;
  }
}
