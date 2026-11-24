import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGridMesh } from '../geometry/primitives';
import type { TextureAsset } from './TextureAsset';
import { buildExportAtlas } from './exportAtlas';

const canvas = {
  width: 0,
  height: 0,
  getContext: () => ({
    clearRect: () => {},
    save: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    restore: () => {},
    drawImage: () => {},
    imageSmoothingEnabled: false
  }),
  toBlob: (callback: (blob: Blob | null) => void) => {
    callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  }
};

function fakeAsset(name: string): TextureAsset {
  return {
    name,
    width: 64,
    height: 64,
    textureFilter: 'linear',
    image: { width: 64, height: 64 }
  } as unknown as TextureAsset;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export atlas', () => {
  it('remaps per-node UVs into one square atlas without mutating meshes', async () => {
    vi.stubGlobal('document', {
      createElement: () => canvas
    });
    const first = createGridMesh(2, 2);
    const second = createGridMesh(2, 2);
    for (let corner = 0; corner < second.halfEdgeCount; corner += 1) {
      second.setCornerUv(corner, [
        0.2 + second.heUv[corner * 2] * 0.5,
        0.2 + second.heUv[corner * 2 + 1] * 0.5
      ]);
    }
    const before = first.heUv.slice();
    const result = await buildExportAtlas(
      [
        { nodeId: 'first', mesh: first, asset: fakeAsset('First') },
        { nodeId: 'second', mesh: second, asset: fakeAsset('Second') }
      ],
      '1024',
      'Test'
    );
    expect(result).not.toBeNull();
    expect(result?.width).toBe(1024);
    expect(result?.height).toBe(1024);
    expect(result?.bytes.byteLength).toBeGreaterThan(0);
    expect(result?.transforms.size).toBe(2);
    expect(first.heUv).toEqual(before);
    const firstTransform = result?.transforms.get('first');
    expect(firstTransform?.scale).toBeGreaterThan(0);
    expect(firstTransform?.offsetU).toBeGreaterThanOrEqual(0);
    expect(firstTransform?.offsetV).toBeGreaterThanOrEqual(0);
  });

  it('returns null when there is nothing textured to pack', async () => {
    const result = await buildExportAtlas([], 'auto', 'Empty');
    expect(result).toBeNull();
  });
});
