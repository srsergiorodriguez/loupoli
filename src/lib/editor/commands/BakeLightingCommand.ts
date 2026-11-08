import type { TextureAsset } from '../../texture/TextureAsset';
import {
  packLightingImageData,
  unpackLightingImageData,
  type CompactLightingBuffer
} from '../../lighting/compact';
import type { EditorCommand } from './EditorCommand';

/** Commit a baked lighting image to one texture layer with undo. */
export class BakeLightingCommand implements EditorCommand {
  readonly label = 'Bake lighting';
  readonly estimatedBytes: number;
  private layerId: string | null;
  private readonly before: CompactLightingBuffer | null;
  private readonly after: CompactLightingBuffer;

  constructor(
    private readonly asset: TextureAsset,
    existingLayerId: string | null,
    before: ImageData | null,
    after: ImageData,
    private readonly layerName = 'Baked lighting'
  ) {
    this.layerId = existingLayerId;
    this.before = before ? packLightingImageData(before) : null;
    this.after = packLightingImageData(after);
    this.estimatedBytes =
      (this.before?.bytes.byteLength ?? 0) +
      this.after.bytes.byteLength +
      256;
  }

  execute(): void {
    if (this.layerId === null) {
      this.layerId = this.asset.addLightingLayer(this.layerName);
    }
    if (this.layerId === null) {
      throw new Error('The texture layer limit prevents baking lighting.');
    }
    this.asset.setLayerPixels(
      this.layerId,
      unpackLightingImageData(this.after)
    );
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
    this.asset.setLayerPixels(
      this.layerId,
      unpackLightingImageData(this.before)
    );
  }
}
