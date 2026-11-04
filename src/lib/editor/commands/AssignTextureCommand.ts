import type { MeshNode } from '../../scene/MeshNode';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

/** Assign one texture asset to one or more mesh nodes as a single undo step. */
export class AssignTextureCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: readonly (string | null)[];

  constructor(
    private readonly nodes: readonly MeshNode[],
    private readonly textureId: string | null
  ) {
    this.before = nodes.map((node) => node.textureId);
    this.label = textureId === null ? 'Unassign texture' : 'Assign texture';
    this.estimatedBytes = nodes.length * 48 + 64;
  }

  execute(): void {
    for (const node of this.nodes) {
      node.textureId = this.textureId;
    }
  }

  undo(): void {
    this.nodes.forEach((node, index) => {
      node.textureId = this.before[index];
    });
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch[] {
    return this.nodes.map((node, index) => ({
      type: 'set-node-texture' as const,
      nodeId: node.id,
      textureId: direction === 'forward' ? this.textureId : this.before[index]
    }));
  }
}
