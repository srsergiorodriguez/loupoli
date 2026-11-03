import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TextureStack,
  TextureStackCommand,
  textureStackStatesEqual
} from './TextureStack';

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

describe('TextureStack', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('document', {
      createElement: () => new FakeCanvas()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with a checker base and adds a layer', () => {
    const stack = new TextureStack(64, 64, '#000000', '#ffffff');
    expect(stack.layerCount).toBe(1);
    expect(stack.summaries()[0].pattern).toBe('checker');
    expect(stack.summaries()[0].name).toBe('Base');
    expect(stack.addLayer()).toBe(true);
    expect(stack.layerCount).toBe(2);
    expect(stack.activeLayerId).toBe(stack.summaries()[1].id);
    stack.dispose();
  });

  it('undoes and redoes a metadata transition', () => {
    const stack = new TextureStack(64, 64, '#000000', '#ffffff');
    const before = stack.snapshot();
    stack.addLayer();
    stack.setColor(stack.activeLayerId as string, '#ff0000');
    stack.setOpacity(stack.activeLayerId as string, 0.25);
    const after = stack.snapshot();
    expect(textureStackStatesEqual(before, after)).toBe(false);

    const command = new TextureStackCommand(stack, before, after, 'Texture edit');
    command.undo();
    expect(stack.layerCount).toBe(1);
    expect(stack.snapshot()).toEqual(before);
    command.execute();
    expect(stack.layerCount).toBe(2);
    expect(stack.snapshot()).toEqual(after);
    stack.dispose();
  });

  it('reorders, hides, and caps layers', () => {
    const stack = new TextureStack(64, 64, '#000000', '#ffffff');
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
