import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec
} from '../geometry/HalfEdgeMesh';
import { meshFaceSpecs } from '../geometry/topology';
import type { MeshNode } from '../scene/MeshNode';

function nodeMatrix(node: MeshNode): Matrix4 {
  const [x, y, z] = node.transform.position;
  const [rx, ry, rz] = node.transform.rotation;
  const [sx, sy, sz] = node.transform.scale;
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'XYZ')),
    new Vector3(sx, sy, sz)
  );
}

/**
 * Combine mesh nodes into the target node's local space.
 *
 * Source geometry is baked through its world transform relative to the target,
 * preserving per-corner UVs and face materials. The target node transform stays
 * unchanged so its pivot and numeric transform remain stable. Exact coincident
 * positions are welded by the DCEL builder; seam flags are not yet remapped.
 */
export function joinMeshNodes(
  nodes: readonly MeshNode[],
  target: MeshNode
): HalfEdgeMesh {
  if (nodes.length < 2) {
    throw new Error('Join requires at least two objects.');
  }
  if (!nodes.includes(target)) {
    throw new Error('The target object must be part of the join.');
  }

  const inverseTarget = nodeMatrix(target).invert();
  const relative = new Map<MeshNode, Matrix4>();
  for (const node of nodes) {
    relative.set(
      node,
      node === target
        ? new Matrix4()
        : inverseTarget.clone().multiply(nodeMatrix(node))
    );
  }

  const faces: MeshFaceSpec[] = [];
  for (const node of nodes) {
    const matrix = relative.get(node)!;
    for (const face of meshFaceSpecs(node.mesh)) {
      const corners = face.corners.map((corner): MeshCornerSpec => {
        const position = new Vector3(...corner.position).applyMatrix4(matrix);
        return {
          position: [position.x, position.y, position.z],
          uv: corner.uv
        };
      });
      faces.push({ corners, material: face.material });
    }
  }

  return HalfEdgeMesh.fromPolygons(faces);
}
