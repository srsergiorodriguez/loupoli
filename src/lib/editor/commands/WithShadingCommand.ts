import type { ShadingMode } from '../types';
import type { EditorCommand } from './EditorCommand';

/**
 * Wrap a document command with a session shading transition.
 *
 * Baking changes the viewport to Unlit to show the baked result. Undo must
 * restore the previous shading mode as well as the document layers, otherwise
 * the lights remain hidden after the bake is undone.
 */
export class WithShadingCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly command: EditorCommand,
    private readonly setShading: (mode: ShadingMode) => void,
    private readonly before: ShadingMode,
    private readonly after: ShadingMode
  ) {
    this.label = command.label;
    this.estimatedBytes = command.estimatedBytes ?? 0;
  }

  execute(): void {
    this.command.execute();
    this.setShading(this.after);
  }

  undo(): void {
    this.command.undo();
    this.setShading(this.before);
  }
}
