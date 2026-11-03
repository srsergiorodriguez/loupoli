import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

/** Replace the complete per-corner UV set in one undoable operation. */
export class ReplaceUvCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: Float32Array;
  private readonly after: Float32Array;

  constructor(
    private readonly mesh: HalfEdgeMesh,
    private readonly nodeId: string,
    before: Float32Array,
    after: Float32Array,
    label = 'Unwrap UVs'
  ) {
    if (before.length !== after.length) {
      throw new Error('UV replacement buffers do not match.');
    }
    this.before = before.slice();
    this.after = after.slice();
    this.label = label;
    this.estimatedBytes = before.byteLength + after.byteLength + 96;
  }

  execute(): void {
    this.mesh.setAllCornerUvs(this.after);
  }

  undo(): void {
    this.mesh.setAllCornerUvs(this.before);
  }

  journalPatch(
    direction: 'forward' | 'backward'
  ): JournalPatch {
    return {
      type: 'replace-uv',
      nodeId: this.nodeId,
      uvs: (direction === 'forward' ? this.after : this.before).slice()
    };
  }
}
