import type { Vec3 } from '../geometry/HalfEdgeMesh';
import {
  createPrimitiveMesh,
  PRIMITIVE_LABELS,
  type PrimitiveKind
} from '../geometry/primitives';
import { MeshNode, type NodeSummary } from './MeshNode';
import { SceneGroup, type GroupSummary } from './SceneGroup';

/**
 * The document's object collection.
 *
 * The document owns topology-bearing nodes only. Active object, selection,
 * camera, and UI state are session state and deliberately do not belong here.
 */
export class SceneDocument {
  readonly nodes: MeshNode[] = [];
  readonly groups: SceneGroup[] = [];

  /** Construct the default first-run scene from the real primitive path. */
  static createDefault(kind: PrimitiveKind = 'quadsphere'): SceneDocument {
    const document = new SceneDocument();
    const mesh = createPrimitiveMesh(kind);
    document.insertNode(new MeshNode(mesh, kind, PRIMITIVE_LABELS[kind]));
    return document;
  }

  /** Find a node by stable id. */
  getNode(id: string | null): MeshNode | undefined {
    if (id === null) {
      return undefined;
    }
    return this.nodes.find((node) => node.id === id);
  }

  /** Find a group by stable id. */
  getGroup(id: string | null): SceneGroup | undefined {
    if (id === null) {
      return undefined;
    }
    return this.groups.find((group) => group.id === id);
  }

  /** Whether the document has no editable objects. */
  get isEmpty(): boolean {
    return this.nodes.length === 0;
  }

  /** Replace the object collection, used by project load and recovery. */
  replaceNodes(nodes: readonly MeshNode[]): void {
    this.nodes.length = 0;
    for (const node of nodes) {
      this.nodes.push(node);
    }
  }

  /** Replace the group collection, used by project load and recovery. */
  replaceGroups(groups: readonly SceneGroup[]): void {
    this.groups.length = 0;
    for (const group of groups) {
      this.groups.push(group);
    }
  }

  /** Insert a group at a specific index, clamped to the current collection. */
  insertGroup(group: SceneGroup, index = this.groups.length): void {
    if (this.getGroup(group.id)) {
      throw new Error(`Scene already contains group ${group.id}.`);
    }
    const clamped = Math.max(0, Math.min(index, this.groups.length));
    this.groups.splice(clamped, 0, group);
  }

  /** Remove a group and return its prior index. */
  removeGroup(id: string): { group: SceneGroup; index: number } | null {
    const index = this.groups.findIndex((group) => group.id === id);
    if (index < 0) {
      return null;
    }
    const [group] = this.groups.splice(index, 1);
    return { group, index };
  }

  /** Create the next uniquely named group without inserting it. */
  createGroup(): SceneGroup {
    let index = this.groups.length + 1;
    const names = new Set(this.groups.map((group) => group.name));
    let name = `Group ${index}`;
    while (names.has(name)) {
      index += 1;
      name = `Group ${index}`;
    }
    return new SceneGroup(name);
  }

  /** Insert a node at a specific index, clamped to the current collection. */
  insertNode(node: MeshNode, index = this.nodes.length): void {
    if (this.getNode(node.id)) {
      throw new Error(`Scene already contains node ${node.id}.`);
    }
    const clamped = Math.max(0, Math.min(index, this.nodes.length));
    this.nodes.splice(clamped, 0, node);
  }

  /** Remove a node and return its prior index for localized undo. */
  removeNode(id: string): { node: MeshNode; index: number } | null {
    const index = this.nodes.findIndex((node) => node.id === id);
    if (index < 0) {
      return null;
    }
    const [node] = this.nodes.splice(index, 1);
    return { node, index };
  }

  /** Create a named primitive node without inserting it yet. */
  createNode(kind: PrimitiveKind): MeshNode {
    const base = PRIMITIVE_LABELS[kind];
    const counts = new Map<string, number>();
    for (const node of this.nodes) {
      const current = counts.get(node.primitive) ?? 0;
      counts.set(node.primitive, current + 1);
    }
    const index = (counts.get(kind) ?? 0) + 1;
    const name = index === 1 ? base : `${base} ${index}`;
    return new MeshNode(createPrimitiveMesh(kind), kind, name);
  }

  /** Compute a non-overlapping local-space X placement for a new node. */
  placementFor(node: MeshNode, spacing = 1.5): Vec3 {
    if (this.nodes.length === 0) {
      return [0, 0, 0];
    }

    const newBounds = node.mesh.getBounds();
    let maxX = -Infinity;
    for (const existing of this.nodes) {
      const bounds = existing.mesh.getBounds();
      maxX = Math.max(
        maxX,
        existing.transform.position[0] + bounds.max[0],
        existing.transform.position[0] + bounds.min[0]
      );
    }
    return [maxX + spacing - newBounds.min[0], 0, 0];
  }

  /** Move one node to a final index in the scene collection. */
  moveNodeToIndex(id: string, index: number): boolean {
    const from = this.nodes.findIndex((node) => node.id === id);
    if (from < 0) {
      return false;
    }
    const [node] = this.nodes.splice(from, 1);
    const to = Math.max(0, Math.min(index, this.nodes.length));
    this.nodes.splice(to, 0, node);
    return from !== to;
  }

  /** Move one group to a final index in the group collection. */
  moveGroupToIndex(id: string, index: number): boolean {
    const from = this.groups.findIndex((group) => group.id === id);
    if (from < 0) {
      return false;
    }
    const [group] = this.groups.splice(from, 1);
    const to = Math.max(0, Math.min(index, this.groups.length));
    this.groups.splice(to, 0, group);
    return from !== to;
  }

  /** UI summaries for the outliner. */
  summaries(): NodeSummary[] {
    return this.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      primitive: node.primitive,
      visible: node.visible,
      parentId: node.parentId
    }));
  }

  /** UI summaries for groups in the outliner. */
  groupSummaries(): GroupSummary[] {
    return this.groups.map((group) => ({
      id: group.id,
      name: group.name,
      visible: group.visible
    }));
  }
}
