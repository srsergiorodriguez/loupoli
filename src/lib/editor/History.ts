import type { EditorCommand } from './commands/EditorCommand';

/** The operation that produced a history notification. */
export type HistoryAction = 'execute' | 'undo' | 'redo';

/** Command-level event used by the autosave journal. */
export interface HistoryEvent {
  readonly action: HistoryAction;
  readonly command: EditorCommand;
}

/** A read-only view of history state for UI controls. */
export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly undoCount: number;
  readonly redoCount: number;
  readonly retainedBytes: number;
}

type HistoryListener = (state: HistoryState, event: HistoryEvent) => void;

/**
 * Bounded undo/redo stack for document commands.
 *
 * This phase keeps commands in memory only. The Phase 2 autosave journal will
 * observe the same committed transitions rather than reimplementing history.
 */
export class History {
  private readonly undoStack: EditorCommand[] = [];
  private readonly redoStack: EditorCommand[] = [];
  private readonly listeners = new Set<HistoryListener>();
  private readonly maxCommands = 100;
  private readonly maxBytes = 32 * 1024 * 1024;
  private retainedBytes = 0;
  private suspended = false;

  /** Execute a new command, clearing any redo branch. */
  execute(command: EditorCommand): void {
    command.execute();
    if (this.suspended) {
      // Shape-key editing is one transaction. Individual vertex commands must
      // still update the viewport, but only the final capture enters history.
      this.emit('execute', command);
      return;
    }
    for (const redoCommand of this.redoStack) {
      this.retainedBytes -= redoCommand.estimatedBytes ?? 0;
    }
    this.redoStack.length = 0;
    this.undoStack.push(command);
    this.retainedBytes += command.estimatedBytes ?? 0;

    while (
      this.undoStack.length > this.maxCommands ||
      (this.retainedBytes > this.maxBytes && this.undoStack.length > 1)
    ) {
      const removed = this.undoStack.shift();
      if (removed) {
        this.retainedBytes -= removed.estimatedBytes ?? 0;
      }
    }

    this.emit('execute', command);
  }

  /** Hold new commands outside the undo stack until resume(). */
  suspend(): void {
    this.suspended = true;
  }

  /** Resume recording commands after a suspended edit transaction. */
  resume(): void {
    this.suspended = false;
  }

  /** Undo the most recent command. Returns true if a command was undone. */
  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) {
      return false;
    }

    command.undo();
    this.redoStack.push(command);
    this.emit('undo', command);
    return true;
  }

  /** Redo the most recently undone command. Returns true if one was reapplied. */
  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) {
      return false;
    }

    command.execute();
    this.undoStack.push(command);
    this.emit('redo', command);
    return true;
  }

  /** Clear all retained commands without emitting a document transition. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.retainedBytes = 0;
  }

  /** Observe history changes. Returns an unsubscribe function. */
  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Current UI-facing state. */
  getState(): HistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.label ?? null,
      redoLabel: this.redoStack.at(-1)?.label ?? null,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      retainedBytes: this.retainedBytes
    };
  }

  /** Remove all history and listeners. */
  dispose(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.retainedBytes = 0;
    this.listeners.clear();
  }

  private emit(action: HistoryAction, command: EditorCommand): void {
    const state = this.getState();
    const event: HistoryEvent = { action, command };
    for (const listener of this.listeners) {
      listener(state, event);
    }
  }
}
