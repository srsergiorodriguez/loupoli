import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  type Texture
} from 'three';

/** A deterministic fill pattern for a texture layer. */
export type TextureLayerPattern = 'checker' | 'solid';

/** Small, rune-safe summary of one texture layer. */
export interface TextureLayerSummary {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly color: string;
  readonly pattern: TextureLayerPattern;
}

/** Serializable metadata for the complete layer stack. */
export interface TextureStackState {
  readonly layers: readonly TextureLayerSummary[];
  readonly activeId: string | null;
}

/** One layer and its binary PNG payload for project persistence. */
export interface TextureLayerRecord extends TextureLayerSummary {
  readonly png: Uint8Array;
}

/** Project-level texture set with binary PNG chunks, never base64. */
export interface TextureProjectData {
  readonly width: number;
  readonly height: number;
  readonly activeId: string | null;
  readonly layers: readonly TextureLayerRecord[];
}

interface TextureLayer {
  readonly id: string;
  readonly name: string;
  visible: boolean;
  opacity: number;
  color: string;
  pattern: TextureLayerPattern;
  readonly canvas: OffscreenCanvas;
  readonly context: OffscreenCanvasRenderingContext2D;
}

let nextLayerNumber = 1;

function layerId(): string {
  const id = `texlayer-${nextLayerNumber}`;
  nextLayerNumber += 1;
  return id;
}

function createLayerCanvas(width: number, height: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('Texture layers require OffscreenCanvas support.');
  }
  return new OffscreenCanvas(width, height);
}

function sameState(a: TextureStackState, b: TextureStackState): boolean {
  if (a.activeId !== b.activeId || a.layers.length !== b.layers.length) {
    return false;
  }
  return a.layers.every((layer, index) => {
    const other = b.layers[index];
    return (
      layer.id === other.id &&
      layer.name === other.name &&
      layer.visible === other.visible &&
      layer.opacity === other.opacity &&
      layer.color === other.color &&
      layer.pattern === other.pattern
    );
  });
}

/**
 * Project-level raster layer stack and single composite texture.
 *
 * Layers use OffscreenCanvas 2D contexts. The composite is an HTML canvas
 * wrapped in one CanvasTexture so the viewport uploads a single GPU texture,
 * never one texture per layer. This first pass stores deterministic fill
 * patterns; the same canvases are ready for projection paint later.
 */
export class TextureStack {
  readonly width: number;
  readonly height: number;
  readonly texture: CanvasTexture;
  private readonly layers: TextureLayer[] = [];
  private readonly composite: HTMLCanvasElement;
  private readonly compositeContext: CanvasRenderingContext2D;
  private activeId: string | null = null;
  private readonly checkerA: string;
  private readonly checkerB: string;
  private revision = 0;

  constructor(
    width = 1024,
    height = 1024,
    checkerA = '#263129',
    checkerB = '#c8c2ad'
  ) {
    this.width = width;
    this.height = height;
    this.checkerA = checkerA;
    this.checkerB = checkerB;
    this.composite = document.createElement('canvas');
    this.composite.width = width;
    this.composite.height = height;
    const context = this.composite.getContext('2d');
    if (!context) {
      throw new Error('Unable to create the texture composite context.');
    }
    this.compositeContext = context;
    this.texture = new CanvasTexture(this.composite);
    this.texture.name = 'loupoli-texture-composite';
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 1;

    const base = this.createLayer('Base', 'solid', '#c8c2ad', 1);
    base.pattern = 'checker';
    this.layers.push(base);
    this.drawLayer(base);
    this.activeId = base.id;
    this.compositeLayers();
  }

  /** Number of layers currently in the stack. */
  get layerCount(): number {
    return this.layers.length;
  }

  /** Monotonic revision for diagnostics and snapshots. */
  get version(): number {
    return this.revision;
  }

  /** Active layer ID, if any. */
  get activeLayerId(): string | null {
    return this.activeId;
  }

  /** Deterministic metadata-only snapshots for commands and undo. */
  snapshot(): TextureStackState {
    return {
      layers: this.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        color: layer.color,
        pattern: layer.pattern
      })),
      activeId: this.activeId
    };
  }

  /** Summaries for the reactive Inspector projection. */
  summaries(): readonly TextureLayerSummary[] {
    return this.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      color: layer.color,
      pattern: layer.pattern
    }));
  }

  /** Apply a previous/next metadata snapshot by redrawing deterministic layers. */
  applyState(state: TextureStackState): void {
    const byId = new Map(this.layers.map((layer) => [layer.id, layer]));
    const next: TextureLayer[] = [];
    for (const summary of state.layers) {
      let layer = byId.get(summary.id);
      if (!layer) {
        layer = this.createLayer(
          summary.name,
          summary.pattern,
          summary.color,
          summary.opacity,
          summary.id
        );
      }
      layer.visible = summary.visible;
      layer.opacity = summary.opacity;
      layer.color = summary.color;
      layer.pattern = summary.pattern;
      this.drawLayer(layer);
      next.push(layer);
      byId.delete(summary.id);
    }
    this.layers.splice(0, this.layers.length, ...next);
    this.activeId = state.activeId;
    this.compositeLayers();
  }

  /** Encode every layer as a binary PNG project payload. */
  async exportProject(): Promise<TextureProjectData> {
    const layers: TextureLayerRecord[] = [];
    for (const layer of this.layers) {
      const blob = await layer.canvas.convertToBlob({ type: 'image/png' });
      layers.push({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        color: layer.color,
        pattern: layer.pattern,
        png: new Uint8Array(await blob.arrayBuffer())
      });
    }
    return {
      width: this.width,
      height: this.height,
      activeId: this.activeId,
      layers
    };
  }

  /** Replace the session stack from decoded PNG project data. */
  async importProject(data: TextureProjectData): Promise<void> {
    if (data.width !== this.width || data.height !== this.height) {
      throw new Error(
        `Texture size ${data.width}×${data.height} does not match this project.`
      );
    }
    const imported: TextureLayer[] = [];
    for (const record of data.layers) {
      const canvas = createLayerCanvas(this.width, this.height);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to create a texture layer context.');
      }
      const pngBuffer = record.png.buffer.slice(
        record.png.byteOffset,
        record.png.byteOffset + record.png.byteLength
      ) as ArrayBuffer;
      const bitmap = await createImageBitmap(
        new Blob([pngBuffer], { type: 'image/png' })
      );
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      imported.push({
        id: record.id,
        name: record.name,
        visible: record.visible,
        opacity: record.opacity,
        color: record.color,
        pattern: record.pattern,
        canvas,
        context
      });
    }
    if (imported.length === 0) {
      this.reset();
      return;
    }
    this.layers.splice(0, this.layers.length, ...imported);
    for (const layer of imported) {
      const match = /^texlayer-(\d+)$/.exec(layer.id);
      if (match) {
        nextLayerNumber = Math.max(nextLayerNumber, Number(match[1]) + 1);
      }
    }
    this.activeId =
      data.activeId && imported.some((layer) => layer.id === data.activeId)
        ? data.activeId
        : imported[imported.length - 1].id;
    this.compositeLayers();
  }

  /** Reset to a single checker base layer after loading a project. */
  reset(): void {
    this.layers.length = 0;
    const base = this.createLayer('Base', 'checker', '#c8c2ad', 1);
    this.layers.push(base);
    this.drawLayer(base);
    this.activeId = base.id;
    this.compositeLayers();
  }

  /** Set the active layer. Active state is UI-only, not undoable. */
  setActive(id: string): void {
    if (this.layers.some((layer) => layer.id === id)) {
      this.activeId = id;
    }
  }

  /** Add a new solid layer at the top. Returns false at the layer cap. */
  addLayer(name?: string): boolean {
    if (this.layers.length >= 8) {
      return false;
    }
    const layer = this.createLayer(
      name ?? `Layer ${this.layers.length + 1}`,
      'solid',
      '#8f8ff8',
      0.55
    );
    this.layers.push(layer);
    this.activeId = layer.id;
    this.drawLayer(layer);
    this.compositeLayers();
    return true;
  }

  /** Remove one layer, keeping at least one layer. */
  removeLayer(id: string): boolean {
    if (this.layers.length <= 1) {
      return false;
    }
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) {
      return false;
    }
    this.layers.splice(index, 1);
    if (this.activeId === id) {
      this.activeId =
        this.layers[Math.min(index, this.layers.length - 1)]?.id ?? null;
    }
    this.compositeLayers();
    return true;
  }

  /** Move a layer by one slot. `direction` is -1 toward the bottom. */
  moveLayer(id: string, direction: -1 | 1): boolean {
    const index = this.layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.layers.length) {
      return false;
    }
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(target, 0, layer);
    this.compositeLayers();
    return true;
  }

  /** Set layer visibility. */
  setVisible(id: string, visible: boolean): boolean {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || layer.visible === visible) {
      return false;
    }
    layer.visible = visible;
    this.compositeLayers();
    return true;
  }

  /** Set layer opacity in [0, 1]. */
  setOpacity(id: string, opacity: number): boolean {
    const layer = this.layers.find((item) => item.id === id);
    const value = Math.min(1, Math.max(0, opacity));
    if (!layer || layer.opacity === value) {
      return false;
    }
    layer.opacity = value;
    this.compositeLayers();
    return true;
  }

  /** Convert a layer to a solid color and redraw it. */
  setColor(id: string, color: string): boolean {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || (layer.color === color && layer.pattern === 'solid')) {
      return false;
    }
    layer.color = color;
    layer.pattern = 'solid';
    this.drawLayer(layer);
    this.compositeLayers();
    return true;
  }

  /** Release the composite texture and layer canvases. */
  dispose(): void {
    this.texture.dispose();
    this.layers.length = 0;
    this.composite.width = 1;
    this.composite.height = 1;
  }

  private createLayer(
    name: string,
    pattern: TextureLayerPattern,
    color: string,
    opacity: number,
    id = layerId()
  ): TextureLayer {
    const canvas = createLayerCanvas(this.width, this.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create a texture layer context.');
    }
    const layer: TextureLayer = {
      id,
      name,
      visible: true,
      opacity,
      color,
      pattern,
      canvas,
      context
    };
    return layer;
  }

  private drawLayer(layer: TextureLayer): void {
    const { context } = layer;
    context.clearRect(0, 0, this.width, this.height);
    if (layer.pattern === 'solid') {
      context.fillStyle = layer.color;
      context.fillRect(0, 0, this.width, this.height);
      return;
    }
    const cells = 8;
    const cell = this.width / cells;
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        context.fillStyle =
          (x + y) % 2 === 0 ? this.checkerA : this.checkerB;
        context.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  private compositeLayers(): void {
    this.compositeContext.clearRect(0, 0, this.width, this.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }
      this.compositeContext.globalAlpha = layer.opacity;
      this.compositeContext.drawImage(layer.canvas, 0, 0);
    }
    this.compositeContext.globalAlpha = 1;
    this.texture.needsUpdate = true;
    this.revision += 1;
  }
}

/** Undoable metadata transition for the texture stack. */
export class TextureStackCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly stack: TextureStack,
    private readonly before: TextureStackState,
    private readonly after: TextureStackState,
    label: string
  ) {
    if (sameState(before, after)) {
      throw new Error('Texture stack command has no state change.');
    }
    this.label = label;
    this.estimatedBytes =
      (before.layers.length + after.layers.length) * 96 + 128;
  }

  execute(): void {
    this.stack.applyState(this.after);
  }

  undo(): void {
    this.stack.applyState(this.before);
  }
}

/** True when two texture stack states are metadata-identical. */
export function textureStackStatesEqual(
  a: TextureStackState,
  b: TextureStackState
): boolean {
  return sameState(a, b);
}

/** The composite texture is the only GPU upload for the stack. */
export function textureStackTexture(stack: TextureStack): Texture {
  return stack.texture;
}
