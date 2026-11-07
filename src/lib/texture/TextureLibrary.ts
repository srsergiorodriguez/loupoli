import {
  TextureAsset,
  type TextureAssetData,
  type TextureAlphaMode,
  type TextureFilter,
  type TextureAssetRole
} from './TextureAsset';
import { MAX_TEXTURE_DIMENSION, MAX_TEXTURE_PIXELS } from './size';

/** Small reactive-safe summary of one texture asset. */
export interface TextureAssetSummary {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly filter: TextureFilter;
  readonly alphaMode: TextureAlphaMode;
  readonly role?: TextureAssetRole;
}

/** One serializable texture asset record. */
export interface TextureAssetRecord extends TextureAssetSummary {
  readonly layers: TextureAssetData['layers'];
  readonly activeId: string | null;
}

let nextAssetNumber = 1;

function assetId(): string {
  const id = `texasset-${nextAssetNumber}`;
  nextAssetNumber += 1;
  return id;
}

/**
 * Project-level texture asset store.
 *
 * Assets are independent of scene nodes; nodes bind by stable asset id. This is
 * the separation that lets several low-poly objects share one atlas texture.
 */
export class TextureLibrary {
  private readonly assets = new Map<string, TextureAsset>();
  private activeId: string | null = null;
  private readonly checkerA: string;
  private readonly checkerB: string;

  constructor(
    defaultSize = 512,
    defaultFilter: TextureFilter = 'nearest',
    checkerA = '#263129',
    checkerB = '#c8c2ad'
  ) {
    this.checkerA = checkerA;
    this.checkerB = checkerB;
    this.reset(defaultSize, defaultFilter);
  }

  /** Active asset, or null for an empty library. */
  get active(): TextureAsset | null {
    return this.activeId === null
      ? null
      : (this.assets.get(this.activeId) ?? null);
  }

  /** Stable id of the active asset. */
  get activeAssetId(): string | null {
    return this.activeId;
  }

  /** Look up an asset by id. */
  get(id: string | null): TextureAsset | null {
    return id === null ? null : (this.assets.get(id) ?? null);
  }

  /** All assets in deterministic insertion order. */
  list(): TextureAsset[] {
    return [...this.assets.values()];
  }

  /** Reactive-safe asset summaries. */
  summaries(): TextureAssetSummary[] {
    return this.list().map((asset) => ({
      id: asset.id,
      name: asset.name,
      width: asset.width,
      height: asset.height,
      filter: asset.textureFilter,
      alphaMode: asset.textureAlphaMode,
      role: asset.role
    }));
  }

  /** Select the active asset used by the texture inspector and new binding. */
  setActive(id: string): boolean {
    if (!this.assets.has(id)) {
      return false;
    }
    this.activeId = id;
    return true;
  }

  /** Build an asset without inserting it, for undoable create commands. */
  build(
    width: number,
    height: number,
    name?: string,
    filter: TextureFilter = 'nearest',
    role: TextureAssetRole = 'model'
  ): TextureAsset {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > MAX_TEXTURE_DIMENSION ||
      height > MAX_TEXTURE_DIMENSION ||
      width * height > MAX_TEXTURE_PIXELS
    ) {
      throw new Error(
        `Texture dimensions must be whole pixels up to ${MAX_TEXTURE_DIMENSION} px and within the texture memory budget.`
      );
    }
    const id = assetId();
    const nextName = name?.trim() || `Texture ${this.assets.size + 1}`;
    return new TextureAsset({
      id,
      name: nextName,
      width,
      height,
      filter,
      role,
      checkerA: this.checkerA,
      checkerB: this.checkerB
    });
  }

  /** Create a new empty asset and make it active. */
  create(
    width: number,
    height: number,
    name?: string,
    filter: TextureFilter = 'nearest',
    role: TextureAssetRole = 'model'
  ): TextureAsset {
    const asset = this.build(width, height, name, filter, role);
    this.insert(asset);
    return asset;
  }

  /** Insert an existing asset, normally through an undoable command. */
  insert(asset: TextureAsset): boolean {
    if (this.assets.has(asset.id)) {
      return false;
    }
    this.assets.set(asset.id, asset);
    this.activeId = asset.id;
    return true;
  }

  /** Detach an asset without disposing it, used by undo/delete commands. */
  detach(id: string): TextureAsset | null {
    const asset = this.assets.get(id);
    if (!asset) {
      return null;
    }
    this.assets.delete(id);
    if (this.activeId === id) {
      this.activeId = this.assets.keys().next().value ?? null;
    }
    return asset;
  }

  /** Remove an asset, refusing to delete the final one. */
  remove(id: string): boolean {
    if (this.assets.size <= 1 || !this.assets.has(id)) {
      return false;
    }
    const asset = this.assets.get(id);
    this.assets.delete(id);
    asset?.dispose();
    if (this.activeId === id) {
      this.activeId = this.assets.keys().next().value ?? null;
    }
    return true;
  }

  /** Create a new empty project library with one default asset. */
  reset(defaultSize = 512, defaultFilter: TextureFilter = 'nearest'): void {
    for (const asset of this.assets.values()) {
      asset.dispose();
    }
    this.assets.clear();
    this.activeId = null;
    this.create(defaultSize, defaultSize, 'Texture 1', defaultFilter);
  }

  /** Export every asset with binary PNG layer payloads. */
  async exportRecords(): Promise<TextureAssetRecord[]> {
    const records: TextureAssetRecord[] = [];
    for (const asset of this.assets.values()) {
      const data = await asset.exportData();
      records.push({
        id: asset.id,
        name: asset.name,
        width: asset.width,
        height: asset.height,
        filter: asset.textureFilter,
        alphaMode: asset.textureAlphaMode,
        role: asset.role,
        activeId: data.activeId,
        layers: data.layers
      });
    }
    return records;
  }

  /** Replace the library from decoded asset records. */
  async importRecords(records: readonly TextureAssetRecord[]): Promise<void> {
    if (records.length === 0) {
      this.reset();
      return;
    }
    const imported: TextureAsset[] = [];
    for (const record of records) {
      if (
        !Number.isInteger(record.width) ||
        !Number.isInteger(record.height) ||
        record.width < 1 ||
        record.height < 1 ||
        record.width > MAX_TEXTURE_DIMENSION ||
        record.height > MAX_TEXTURE_DIMENSION ||
        record.width * record.height > MAX_TEXTURE_PIXELS
      ) {
        throw new Error('Decoded texture dimensions are invalid.');
      }
      const asset = new TextureAsset({
        id: record.id,
        name: record.name,
        width: record.width,
        height: record.height,
        filter: record.filter,
        alphaMode: record.alphaMode,
        role: record.role ?? 'model',
        checkerA: this.checkerA,
        checkerB: this.checkerB
      });
      await asset.importData({
        width: record.width,
        height: record.height,
        activeId: record.activeId,
        layers: record.layers
      });
      imported.push(asset);
    }
    for (const asset of this.assets.values()) {
      asset.dispose();
    }
    this.assets.clear();
    for (const asset of imported) {
      this.assets.set(asset.id, asset);
      const match = /^texasset-(\d+)$/.exec(asset.id);
      if (match) {
        nextAssetNumber = Math.max(nextAssetNumber, Number(match[1]) + 1);
      }
    }
    this.activeId = imported[0].id;
  }

  /** Release all CPU/GPU texture resources. */
  dispose(): void {
    for (const asset of this.assets.values()) {
      asset.dispose();
    }
    this.assets.clear();
    this.activeId = null;
  }
}
