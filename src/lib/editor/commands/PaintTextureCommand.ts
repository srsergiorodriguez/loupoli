import type {
  TextureAsset,
  TexturePaintPatch
} from '../../texture/TextureAsset';
import type { EditorCommand } from './EditorCommand';

/** One localized raster paint stroke on an active texture layer. */
export class PaintTextureCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly asset: TextureAsset,
    private readonly patch: TexturePaintPatch,
    label = 'Paint texture stroke'
  ) {
    this.label = label;
    this.estimatedBytes =
      patch.before.byteLength + patch.after.byteLength + 128;
  }

  execute(): void {
    this.asset.applyPaintPatch(this.patch, 'after');
  }

  undo(): void {
    this.asset.applyPaintPatch(this.patch, 'before');
  }
}
