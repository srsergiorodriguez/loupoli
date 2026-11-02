import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { NodeTransform } from '../scene/MeshNode';

/** Compose a local Euler transform into a matrix. */
export function transformMatrix(transform: NodeTransform): Matrix4 {
  const [x, y, z] = transform.position;
  const [rx, ry, rz] = transform.rotation;
  const [sx, sy, sz] = transform.scale;
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
    new Vector3(sx, sy, sz)
  );
}

/**
 * Bake a parent group transform into a child local transform.
 *
 * The inverse-composed matrix is decomposed back to position/Euler/scale. The
 * DCEL is unaffected; the child's world pose is preserved for one-level groups.
 */
export function bakeGroupTransform(
  groupTransform: NodeTransform,
  childTransform: NodeTransform
): NodeTransform {
  const matrix = transformMatrix(groupTransform).multiply(
    transformMatrix(childTransform)
  );
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  matrix.decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion, 'XYZ');
  return {
    position: [position.x, position.y, position.z],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [scale.x, scale.y, scale.z]
  };
}

/** Deep-copy a transform. */
export function cloneNodeTransform(transform: NodeTransform): NodeTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale]
  };
}
