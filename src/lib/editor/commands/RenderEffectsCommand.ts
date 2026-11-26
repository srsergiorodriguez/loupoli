import type { RenderEffect } from '../../render/effects';
import type { EditorCommand } from './EditorCommand';

/**
 * Replace the project render-effect stack.
 *
 * Render effects are project settings rather than scene geometry, so this
 * command participates in undo/redo but does not emit a scene journal patch;
 * the next autosave checkpoint persists the new settings.
 */
export class RenderEffectsCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: readonly RenderEffect[];
  private readonly after: readonly RenderEffect[];

  constructor(
    private readonly apply: (effects: readonly RenderEffect[]) => void,
    before: readonly RenderEffect[],
    after: readonly RenderEffect[],
    label = 'Edit render effects'
  ) {
    this.before = before.map((effect) => ({ ...effect }));
    this.after = after.map((effect) => ({ ...effect }));
    this.label = label;
    this.estimatedBytes =
      (this.before.length + this.after.length) * 96 + 128;
  }

  execute(): void {
    this.apply(this.after);
  }

  undo(): void {
    this.apply(this.before);
  }
}
