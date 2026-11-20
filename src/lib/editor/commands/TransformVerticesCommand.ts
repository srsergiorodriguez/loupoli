import type { HalfEdgeMesh, Vec3 } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

/**
 * A localized transform of a set of existing vertices.
 *
 * Only affected positions are stored; topology, UVs, seams, and materials are
 * untouched. Autosave receives one move-vertex patch per affected vertex.
 */
export class TransformVerticesCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly vertices: readonly number[];
  private readonly before: readonly Vec3[];
  private readonly after: readonly Vec3[];
  private readonly renameFrom: string | null;
  private readonly renameTo: string | null;

  constructor(
    private readonly mesh: HalfEdgeMesh,
    vertices: readonly number[],
    before: readonly Vec3[],
    after: readonly Vec3[],
    private readonly nodeId: string | null,
    label?: string,
    private readonly node: MeshNode | null = null
  ) {
    if (before.length !== vertices.length || after.length !== vertices.length) {
      throw new Error('Vertex transform position count does not match.');
    }
    this.vertices = [...vertices];
    this.before = before.map((position) => [...position] as Vec3);
    this.after = after.map((position) => [...position] as Vec3);
    this.renameFrom = node?.hasPrimitiveName() ? node.name : null;
    this.renameTo = this.renameFrom === null ? null : node?.customName() ?? null;
    this.label = label ?? `Transform ${vertices.length} vertices`;
    this.estimatedBytes = vertices.length * 48 + 64;
  }

  execute(): void {
    if (this.renameFrom !== null && this.renameTo !== null && this.node) {
      this.node.name = this.renameTo;
    }
    for (let index = 0; index < this.vertices.length; index += 1) {
      this.mesh.setVertexPosition(this.vertices[index], this.after[index]);
    }
  }

  undo(): void {
    for (let index = 0; index < this.vertices.length; index += 1) {
      this.mesh.setVertexPosition(this.vertices[index], this.before[index]);
    }
    if (this.renameFrom !== null && this.node) {
      this.node.name = this.renameFrom;
    }
  }

  journalPatch(
    direction: 'forward' | 'backward'
  ): JournalPatch | readonly JournalPatch[] | null {
    if (this.nodeId === null) {
      return null;
    }
    const patches: JournalPatch[] = [];
    if (this.renameFrom !== null && this.renameTo !== null) {
      patches.push({
        type: 'set-node-name',
        nodeId: this.nodeId,
        name: direction === 'forward' ? this.renameTo : this.renameFrom
      });
    }
    for (let index = 0; index < this.vertices.length; index += 1) {
      patches.push({
        type: 'move-vertex',
        nodeId: this.nodeId,
        vertex: this.vertices[index],
        position: [
          ...(direction === 'forward' ? this.after[index] : this.before[index])
        ] as Vec3
      });
    }
    return patches;
  }
}
