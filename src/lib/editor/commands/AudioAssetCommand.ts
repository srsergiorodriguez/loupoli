import type { EditorCommand } from './EditorCommand';
import type { SceneDocument } from '../../scene/SceneDocument';
import { AudioAsset } from '../../audio/AudioAsset';

/** Add or remove one project-level audio asset. */
export class AudioAssetCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly asset: AudioAsset;
  private readonly add: boolean;

  constructor(
    private readonly document: SceneDocument,
    asset: AudioAsset,
    add: boolean,
    label: string
  ) {
    this.asset = AudioAsset.fromSnapshot(asset.snapshot());
    this.add = add;
    this.label = label;
    this.estimatedBytes = this.asset.bytes.byteLength;
  }

  execute(): void {
    if (this.add) {
      this.document.insertAudioAsset(this.asset);
    } else {
      this.document.removeAudioAsset(this.asset.id);
    }
  }

  undo(): void {
    if (this.add) {
      this.document.removeAudioAsset(this.asset.id);
    } else {
      this.document.insertAudioAsset(this.asset);
    }
  }
}
