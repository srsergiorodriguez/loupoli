import type { JournalPatch } from '../../project/journal';

/**
 * A reversible document mutation.
 *
 * Commands capture only the data they change. UI state, camera motion, and
 * Three.js objects must never be stored inside a command.
 */
export interface EditorCommand {
  /** Human-readable label used by undo/redo controls and diagnostics. */
  readonly label: string;
  /** Approximate retained bytes used by the bounded history budget. */
  readonly estimatedBytes?: number;
  /** Apply the forward mutation. Must be safe to call after an undo. */
  execute(): void;
  /** Restore the exact previous document state. */
  undo(): void;
  /** Serializable transition for autosave, if this command mutates the scene. */
  journalPatch?(
    direction: 'forward' | 'backward'
  ): JournalPatch | readonly JournalPatch[] | null;
}
