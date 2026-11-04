import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TextureAsset,
  TextureAssetCommand,
  textureAssetStatesEqual
} from './TextureAsset';

class FakeContext {
  globalAlpha = 1;
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

describe('TextureAsset', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('document', {
      createElement: () => new FakeCanvas()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('switches sampling filters without touching layers', () => {
    const stack = new TextureAsset({
      id: 'filter-test',
      name: 'Filter',
      width: 64,
      height: 64,
      filter: 'nearest',
      checkerA: '#000000',
      checkerB: '#ffffff'
    });
    expect(stack.textureFilter).toBe('nearest');
    expect(stack.setFilter('linear')).toBe(true);
    expect(stack.textureFilter).toBe('linear');
    expect(stack.layerCount).toBe(1);
  });

  it('starts with a checker base and adds a layer', () => {
    const stack = new TextureAsset({
      id: 'test-asset',
      name: 'Test',
      width: 64,
      height: 64,
      checkerA: '#000000',
      checkerB: '#ffffff'
    });
    expect(stack.layerCount).toBe(1);
    expect(stack.summaries()[0].pattern).toBe('checker');
    expect(stack.summaries()[0].name).toBe('Base');
    expect(stack.addLayer()).toBe(true);
    expect(stack.layerCount).toBe(2);
    expect(stack.activeLayerId).toBe(stack.summaries()[1].id);
    stack.dispose();
  });

  it('undoes and redoes a metadata transition', () => {
    const stack = new TextureAsset({
      id: 'test-asset',
      name: 'Test',
      width: 64,
      height: 64,
      checkerA: '#000000',
      checkerB: '#ffffff'
    });
    const before = stack.snapshot();
    stack.addLayer();
    stack.setColor(stack.activeLayerId as string, '#ff0000');
    stack.setOpacity(stack.activeLayerId as string, 0.25);
    const after = stack.snapshot();
    expect(textureAssetStatesEqual(before, after)).toBe(false);

    const command = new TextureAssetCommand(stack, before, after, 'Texture edit');
    command.undo();
    expect(stack.layerCount).toBe(1);
    expect(stack.snapshot()).toEqual(before);
    command.execute();
    expect(stack.layerCount).toBe(2);
    expect(stack.snapshot()).toEqual(after);
    stack.dispose();
  });

  it('renames and changes a blend mode with undo', () => {
    const stack = new TextureAsset({
      id: 'test-asset',
      name: 'Test',
      width: 64,
      height: 64,
      checkerA: '#000000',
      checkerB: '#ffffff'
    });
    const before = stack.snapshot();
    stack.addLayer();
    const id = stack.activeLayerId as string;
    expect(stack.setName(id, 'Ink')).toBe(true);
    expect(stack.setBlendMode(id, 'multiply')).toBe(true);
    expect(stack.summaries()[1].name).toBe('Ink');
    expect(stack.summaries()[1].blendMode).toBe('multiply');
    const after = stack.snapshot();
    const command = new TextureAssetCommand(stack, before, after, 'Layer edit');
    command.undo();
    expect(stack.layerCount).toBe(1);
    command.execute();
    expect(stack.activeLayerId).toBe(id);
    expect(stack.summaries()[1].name).toBe('Ink');
    stack.dispose();
  });

  it('reorders, hides, and caps layers', () => {
    const stack = new TextureAsset({
      id: 'test-asset',
      name: 'Test',
      width: 64,
      height: 64,
      checkerA: '#000000',
      checkerB: '#ffffff'
    });
    const base = stack.summaries()[0];
    stack.addLayer();
    const top = stack.summaries()[1];
    expect(stack.moveLayer(top.id, -1)).toBe(true);
    expect(stack.summaries()[0].id).toBe(top.id);
    expect(stack.setVisible(base.id, false)).toBe(true);
    expect(stack.summaries().find((layer) => layer.id === base.id)?.visible).toBe(false);
    while (stack.addLayer()) {
      // fill to the cap
    }
    expect(stack.layerCount).toBe(8);
    stack.dispose();
  });
});
