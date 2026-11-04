import type { TextureAsset, TextureFilter } from '../../texture/TextureAsset';
import type { TextureLibrary } from '../../texture/TextureLibrary';
import type { EditorCommand } from './EditorCommand';

/** Insert a newly built texture asset into the project library. */
export class CreateTextureAssetCommand implements EditorCommand {
  readonly label = 'Create texture asset';
  readonly estimatedBytes: number;

  constructor(
    private readonly library: TextureLibrary,
    private readonly asset: TextureAsset
  ) {
    this.estimatedBytes = asset.width * asset.height * 16 + 256;
  }

  execute(): void {
    this.library.insert(this.asset);
  }

  undo(): void {
    this.library.detach(this.asset.id);
  }
}

/** Remove an unreferenced texture asset, retaining it for undo. */
export class DeleteTextureAssetCommand implements EditorCommand {
  readonly label = 'Delete texture asset';
  readonly estimatedBytes: number;

  constructor(
    private readonly library: TextureLibrary,
    private readonly asset: TextureAsset
  ) {
    this.estimatedBytes = asset.width * asset.height * 16 + 256;
  }

  execute(): void {
    this.library.detach(this.asset.id);
  }

  undo(): void {
    this.library.insert(this.asset);
  }
}


/** Change the sampling filter on one texture asset. */
export class SetTextureFilterCommand implements EditorCommand {
  readonly label = 'Change texture filter';
  readonly estimatedBytes = 64;

  constructor(
    private readonly asset: TextureAsset,
    private readonly before: TextureFilter,
    private readonly after: TextureFilter
  ) {}

  execute(): void {
    this.asset.setFilter(this.after);
  }

  undo(): void {
    this.asset.setFilter(this.before);
  }
}
