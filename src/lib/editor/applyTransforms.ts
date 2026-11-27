import type { Vec3 } from '../geometry/HalfEdgeMesh';
import type { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import type { NodeTransform, ShapeKey } from '../scene/MeshNode';
import { transformMatrix } from './groupTransforms';
import { Vector3 } from 'three';

/** Result of baking a mesh node's local transform into rest data. */
export interface BakedNodeTransform {
  readonly mesh: HalfEdgeMesh;
  readonly shapeKeys: ShapeKey[];
}

function transformPoints(
  source: Float32Array,
  matrix: ReturnType<typeof transformMatrix>
): Float32Array {
  const result = new Float32Array(source.length);
  const point = new Vector3();
  for (let offset = 0; offset < source.length; offset += 3) {
    point
      .set(source[offset], source[offset + 1], source[offset + 2])
      .applyMatrix4(matrix);
    result[offset] = point.x;
    result[offset + 1] = point.y;
    result[offset + 2] = point.z;
  }
  return result;
}

/**
 * Bake an object's position, rotation, and scale into its rest mesh and shape
 * key targets without changing world-space geometry.
 */
export function bakeNodeTransform(
  mesh: HalfEdgeMesh,
  transform: NodeTransform,
  shapeKeys: readonly ShapeKey[]
): BakedNodeTransform {
  const matrix = transformMatrix(transform);
  const positions = transformPoints(mesh.positions, matrix);
  const bakedMesh = mesh.withPositions(positions);
  return {
    mesh: bakedMesh,
    shapeKeys: shapeKeys.map((key) => ({
      id: key.id,
      name: key.name,
      weight: key.weight,
      visible: key.visible,
      targetPositions: transformPoints(key.targetPositions, matrix)
    }))
  };
}

/** Identity transform written after apply-transforms. */
export function identityTransform(): NodeTransform {
  return {
    position: [0, 0, 0] as Vec3,
    rotation: [0, 0, 0] as Vec3,
    scale: [1, 1, 1] as Vec3
  };
}
