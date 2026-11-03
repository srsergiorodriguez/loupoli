import type { SelectionMode } from '../../scene/MeshNode';
import type { UvSelectionMode } from '../../uv/uvElements';
import type { EditorCommand } from './EditorCommand';

/** One restorable 3D and UV element-selection state. */
export interface SelectionSnapshot {
  readonly nodeId: string | null;
  readonly mode: SelectionMode;
  readonly values: readonly number[];
  readonly uvMode: UvSelectionMode;
  readonly uvValues: readonly number[];
}

/** Whether two selection snapshots are visually identical. */
export function selectionSnapshotsEqual(
  a: SelectionSnapshot,
  b: SelectionSnapshot
): boolean {
  return (
    a.nodeId === b.nodeId &&
    a.mode === b.mode &&
    a.uvMode === b.uvMode &&
    a.values.length === b.values.length &&
    a.values.every((value, index) => value === b.values[index]) &&
    a.uvValues.length === b.uvValues.length &&
    a.uvValues.every((value, index) => value === b.uvValues[index])
  );
}

/** Undoable selection change stored in the main command history. */
export class SelectionCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly restore: (snapshot: SelectionSnapshot) => void,
    private readonly before: SelectionSnapshot,
    private readonly after: SelectionSnapshot,
    label = 'Select element'
  ) {
    this.label = label;
    this.estimatedBytes =
      96 + (before.values.length + after.values.length) * 8;
  }

  execute(): void {
    this.restore(this.after);
  }

  undo(): void {
    this.restore(this.before);
  }
}
