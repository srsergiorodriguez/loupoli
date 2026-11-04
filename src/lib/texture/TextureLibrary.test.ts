import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextureLibrary } from './TextureLibrary';

class FakeContext {
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '';
  clearRect(): void {}
  fillRect(): void {}
  drawImage(): void {}
}

class FakeCanvas {
  width = 0;
  height = 0;
  readonly context = new FakeContext();
  getContext(): FakeContext {
    return this.context;
  }
}

class FakeOffscreenCanvas extends FakeCanvas {}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal('document', {
    createElement: () => new FakeCanvas()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TextureLibrary', () => {
  it('starts with a 512 nearest-neighbour asset', () => {
    const library = new TextureLibrary(512, 'nearest', '#000000', '#ffffff');
    expect(library.list()).toHaveLength(1);
    expect(library.active?.width).toBe(512);
    expect(library.active?.height).toBe(512);
    expect(library.active?.textureFilter).toBe('nearest');
    library.dispose();
  });

  it('creates independent assets at different resolutions', () => {
    const library = new TextureLibrary(64, 'nearest', '#000000', '#ffffff');
    const first = library.active;
    const second = library.create(128, 256, 'Atlas', 'linear');
    expect(library.active).toBe(second);
    expect(first).not.toBe(second);
    expect(second.width).toBe(128);
    expect(second.height).toBe(256);
    expect(second.textureFilter).toBe('linear');
    expect(library.list()).toHaveLength(2);
    library.dispose();
  });

  it('refuses to delete the last asset', () => {
    const library = new TextureLibrary(64, 'nearest', '#000000', '#ffffff');
    expect(library.remove(library.activeAssetId as string)).toBe(false);
    library.dispose();
  });
});

describe('texture asset commands', () => {
  it('inserts and removes a texture asset with undo', async () => {
    const { CreateTextureAssetCommand, DeleteTextureAssetCommand } = await import(
      '../editor/commands/TextureAssetCommands'
    );
    const library = new TextureLibrary(64, 'nearest', '#000000', '#ffffff');
    const asset = library.build(128, 128, 'Imported');
    const create = new CreateTextureAssetCommand(library, asset);
    create.execute();
    expect(library.list()).toHaveLength(2);
    expect(library.active).toBe(asset);
    create.undo();
    expect(library.list()).toHaveLength(1);
    create.execute();
    const remove = new DeleteTextureAssetCommand(library, asset);
    remove.execute();
    expect(library.list()).toHaveLength(1);
    remove.undo();
    expect(library.list()).toHaveLength(2);
    library.dispose();
  });
});
