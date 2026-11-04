import type { TextureAsset } from '../../texture/TextureAsset';
import type { EditorCommand } from './EditorCommand';

/** Commit a baked lighting image to one texture layer with undo. */
export class BakeLightingCommand implements EditorCommand {
  readonly label = 'Bake lighting';
  readonly estimatedBytes: number;
  private layerId: string | null;

  constructor(
    private readonly asset: TextureAsset,
    existingLayerId: string | null,
    private readonly before: ImageData | null,
    private readonly after: ImageData,
    private readonly layerName = 'Baked lighting'
  ) {
    this.layerId = existingLayerId;
    this.estimatedBytes = after.width * after.height * 4 * 2 + 256;
  }

  execute(): void {
    if (this.layerId === null) {
      this.layerId = this.asset.addLightingLayer(this.layerName);
    }
    if (this.layerId === null) {
      throw new Error('The texture layer limit prevents baking lighting.');
    }
    this.asset.setLayerPixels(this.layerId, this.after);
  }

  undo(): void {
    if (this.layerId === null) {
      return;
    }
    if (this.before === null) {
      this.asset.removeLayer(this.layerId);
      this.layerId = null;
      return;
    }
    this.asset.setLayerPixels(this.layerId, this.before);
  }
}
