import type {
  TexturePaintPatch,
  TextureStack
} from '../../texture/TextureStack';
import type { EditorCommand } from './EditorCommand';

/** One localized raster paint stroke on an active texture layer. */
export class PaintTextureCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly stack: TextureStack,
    private readonly patch: TexturePaintPatch,
    label = 'Paint texture stroke'
  ) {
    this.label = label;
    this.estimatedBytes =
      patch.before.byteLength + patch.after.byteLength + 128;
  }

  execute(): void {
    this.stack.applyPaintPatch(this.patch, 'after');
  }

  undo(): void {
    this.stack.applyPaintPatch(this.patch, 'before');
  }
}
