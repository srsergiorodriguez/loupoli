import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

/** Execute several localized commands as one history transaction. */
export class CompositeCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    label: string,
    private readonly commands: readonly EditorCommand[]
  ) {
    this.label = label;
    this.estimatedBytes = commands.reduce(
      (total, command) => total + (command.estimatedBytes ?? 0),
      0
    );
  }

  execute(): void {
    for (const command of this.commands) {
      command.execute();
    }
  }

  undo(): void {
    for (let index = this.commands.length - 1; index >= 0; index -= 1) {
      this.commands[index].undo();
    }
  }

  journalPatch(
    direction: 'forward' | 'backward'
  ): readonly JournalPatch[] {
    const patches: JournalPatch[] = [];
    for (const command of this.commands) {
      const patch = command.journalPatch?.(direction);
      if (patch) {
        patches.push(...(Array.isArray(patch) ? patch : [patch]));
      }
    }
    return patches;
  }
}
