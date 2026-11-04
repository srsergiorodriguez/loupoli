import type { Vec2, Vec3 } from '../geometry/HalfEdgeMesh';
import type { NodeTransform } from '../scene/MeshNode';
import { validateModifiers, type Modifier } from '../geometry/modifiers';
import { SceneDocument } from '../scene/SceneDocument';
import {
  restoreGroup,
  restoreMesh,
  restoreNode,
  snapshotNode,
  type GroupSnapshot,
  type MeshSnapshot,
  type NodeSnapshot
} from './lpoly';

/** One applied document transition recorded by the autosave journal. */
export type JournalPatch =
  | {
      readonly type: 'move-vertex';
      readonly nodeId: string;
      readonly vertex: number;
      readonly position: Vec3;
    }
  | {
      readonly type: 'set-edge-seam';
      readonly nodeId: string;
      readonly edge: number;
      readonly seam: boolean;
    }
  | {
      readonly type: 'move-uv';
      readonly nodeId: string;
      readonly corner: number;
      readonly uv: Vec2;
    }
  | {
      readonly type: 'replace-uv';
      readonly nodeId: string;
      readonly uvs: Float32Array;
    }
  | {
      readonly type: 'insert-node';
      readonly index: number;
      readonly node: NodeSnapshot;
    }
  | {
      readonly type: 'remove-node';
      readonly nodeId: string;
    }
  | {
      readonly type: 'transform-node';
      readonly nodeId: string;
      readonly transform: NodeTransform;
    }
  | {
      readonly type: 'replace-mesh';
      readonly nodeId: string;
      readonly mesh: MeshSnapshot;
    }
  | {
      readonly type: 'insert-group';
      readonly index: number;
      readonly group: GroupSnapshot;
    }
  | {
      readonly type: 'remove-group';
      readonly groupId: string;
    }
  | {
      readonly type: 'parent-node';
      readonly nodeId: string;
      readonly parentId: string | null;
    }
  | {
      readonly type: 'transform-group';
      readonly groupId: string;
      readonly transform: NodeTransform;
    }
  | {
      readonly type: 'set-modifiers';
      readonly nodeId: string;
      readonly modifiers: readonly Modifier[];
    }
  | {
      readonly type: 'reorder-node';
      readonly nodeId: string;
      readonly index: number;
    }
  | {
      readonly type: 'set-node-visible';
      readonly nodeId: string;
      readonly visible: boolean;
    }
  | {
      readonly type: 'set-node-name';
      readonly nodeId: string;
      readonly name: string;
    }
  | {
      readonly type: 'set-node-texture';
      readonly nodeId: string;
      readonly textureId: string | null;
    }
  | {
      readonly type: 'set-group-visible';
      readonly groupId: string;
      readonly visible: boolean;
    }
  | {
      readonly type: 'set-group-name';
      readonly groupId: string;
      readonly name: string;
    };

/** Apply one journal patch to a reconstructed scene document. */
export function applyJournalPatch(
  document: SceneDocument,
  patch: JournalPatch
): void {
  switch (patch.type) {
    case 'move-vertex': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.mesh.setVertexPosition(patch.vertex, patch.position);
      return;
    }
    case 'move-uv': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.mesh.setCornerUv(patch.corner, patch.uv);
      return;
    }
    case 'replace-uv': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.mesh.setAllCornerUvs(patch.uvs);
      return;
    }
    case 'set-edge-seam': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.mesh.setEdgeSeam(patch.edge, patch.seam);
      return;
    }
    case 'insert-node': {
      document.insertNode(restoreNode(patch.node), patch.index);
      return;
    }
    case 'remove-node': {
      if (!document.removeNode(patch.nodeId)) {
        throw new Error(`Autosave cannot remove missing node ${patch.nodeId}.`);
      }
      return;
    }
    case 'transform-node': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.setTransform(patch.transform);
      return;
    }
    case 'replace-mesh': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.setMesh(restoreMesh(patch.mesh));
      return;
    }
    case 'insert-group': {
      document.insertGroup(restoreGroup(patch.group), patch.index);
      return;
    }
    case 'remove-group': {
      if (!document.removeGroup(patch.groupId)) {
        throw new Error(`Autosave cannot remove missing group ${patch.groupId}.`);
      }
      return;
    }
    case 'parent-node': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      if (patch.parentId !== null && !document.getGroup(patch.parentId)) {
        throw new Error(`Autosave references missing group ${patch.parentId}.`);
      }
      node.setParentId(patch.parentId);
      return;
    }
    case 'transform-group': {
      const group = document.getGroup(patch.groupId);
      if (!group) {
        throw new Error(`Autosave references missing group ${patch.groupId}.`);
      }
      group.setTransform(patch.transform);
      return;
    }
    case 'reorder-node': {
      if (!document.moveNodeToIndex(patch.nodeId, patch.index)) {
        throw new Error(`Autosave cannot reorder node ${patch.nodeId}.`);
      }
      return;
    }
    case 'set-node-visible': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.visible = patch.visible;
      return;
    }
    case 'set-node-name': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.name = patch.name;
      return;
    }
    case 'set-node-texture': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.textureId = patch.textureId;
      return;
    }
    case 'set-group-visible': {
      const group = document.getGroup(patch.groupId);
      if (!group) {
        throw new Error(`Autosave references missing group ${patch.groupId}.`);
      }
      group.visible = patch.visible;
      return;
    }
    case 'set-group-name': {
      const group = document.getGroup(patch.groupId);
      if (!group) {
        throw new Error(`Autosave references missing group ${patch.groupId}.`);
      }
      group.name = patch.name;
      return;
    }
    case 'set-modifiers': {
      const node = document.getNode(patch.nodeId);
      if (!node) {
        throw new Error(`Autosave references missing node ${patch.nodeId}.`);
      }
      node.setModifiers(validateModifiers(patch.modifiers));
    }
  }
}

/** Approximate structured-clone byte footprint of one journal patch. */
export function journalPatchBytes(patch: JournalPatch): number {
  if (patch.type === 'move-vertex') {
    return 48;
  }
  if (patch.type === 'reorder-node') {
    return patch.nodeId.length * 2 + 32;
  }
  if (patch.type === 'set-node-visible') {
    return patch.nodeId.length * 2 + 24;
  }
  if (patch.type === 'set-node-name') {
    return patch.nodeId.length * 2 + patch.name.length * 2 + 16;
  }
  if (patch.type === 'set-node-texture') {
    return patch.nodeId.length * 2 + (patch.textureId?.length ?? 0) * 2 + 24;
  }
  if (patch.type === 'set-group-visible') {
    return patch.groupId.length * 2 + 24;
  }
  if (patch.type === 'set-group-name') {
    return patch.groupId.length * 2 + patch.name.length * 2 + 16;
  }
  if (patch.type === 'remove-node') {
    return patch.nodeId.length * 2 + 16;
  }
  if (patch.type === 'transform-node') {
    return patch.nodeId.length * 2 + 96;
  }
  if (patch.type === 'remove-group') {
    return patch.groupId.length * 2 + 16;
  }
  if (patch.type === 'parent-node') {
    return patch.nodeId.length * 2 + (patch.parentId?.length ?? 0) * 2 + 32;
  }
  if (patch.type === 'transform-group') {
    return patch.groupId.length * 2 + 96;
  }
  if (patch.type === 'insert-group') {
    return (
      patch.group.id.length * 2 +
      patch.group.name.length * 2 +
      192
    );
  }
  if (patch.type === 'set-modifiers') {
    return patch.nodeId.length * 2 + patch.modifiers.length * 128 + 32;
  }
  if (patch.type === 'set-edge-seam') {
    return patch.nodeId.length * 2 + 24;
  }
  if (patch.type === 'move-uv') {
    return patch.nodeId.length * 2 + 32;
  }
  if (patch.type === 'replace-uv') {
    return patch.nodeId.length * 2 + patch.uvs.byteLength + 16;
  }
  if (patch.type === 'replace-mesh') {
    const mesh = patch.mesh;
    return (
      patch.nodeId.length * 2 +
      mesh.positions.byteLength +
      mesh.vertexOut.byteLength +
      mesh.heOrigin.byteLength +
      mesh.heTwin.byteLength +
      mesh.heNext.byteLength +
      mesh.heFace.byteLength +
      mesh.heEdge.byteLength +
      mesh.heUv.byteLength +
      mesh.edgeHalfEdge.byteLength +
      mesh.edgeFlags.byteLength +
      mesh.faceHalfEdge.byteLength +
      mesh.faceMaterial.byteLength +
      64
    );
  }
  const mesh = patch.node.mesh;
  return (
    patch.node.name.length * 2 +
    patch.node.id.length * 2 +
    mesh.positions.byteLength +
    mesh.vertexOut.byteLength +
    mesh.heOrigin.byteLength +
    mesh.heTwin.byteLength +
    mesh.heNext.byteLength +
    mesh.heFace.byteLength +
    mesh.heEdge.byteLength +
    mesh.heUv.byteLength +
    mesh.edgeHalfEdge.byteLength +
    mesh.edgeFlags.byteLength +
    mesh.faceHalfEdge.byteLength +
    mesh.faceMaterial.byteLength +
    96
  );
}
export { snapshotNode };
