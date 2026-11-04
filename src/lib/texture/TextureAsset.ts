import {
  CanvasTexture,
  LinearFilter,
  NearestFilter,
  SRGBColorSpace,
  type Texture
} from 'three';

/** A deterministic fill pattern for a texture layer. */
export type TextureLayerPattern = 'checker' | 'solid';

/** Supported layer compositing modes. */
export type TextureBlendMode = 'normal' | 'multiply' | 'screen';

/** Authored content kind for one texture layer. */
export type TextureLayerKind = 'fill' | 'raster';

/** Future lighting/bake role for one texture layer. */
export type TextureLayerRole = 'color' | 'detail' | 'lighting';

/** Small, rune-safe summary of one texture layer. */
export interface TextureLayerSummary {
  readonly id: string;
  name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly color: string;
  readonly pattern: TextureLayerPattern;
  readonly blendMode: TextureBlendMode;
  readonly kind: TextureLayerKind;
  readonly role: TextureLayerRole;
}

/** Serializable metadata for the complete layer stack. */
export interface TextureAssetState {
  readonly layers: readonly TextureLayerSummary[];
  readonly activeId: string | null;
}

/** One layer and its binary PNG payload for project persistence. */
export interface TextureLayerRecord extends TextureLayerSummary {
  readonly png: Uint8Array;
}

/** A localized before/after pixel patch for one paint stroke. */
export interface TexturePaintPatch {
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly before: Uint8ClampedArray;
  readonly after: Uint8ClampedArray;
}

/** Project-level texture set with binary PNG chunks, never base64. */
export interface TextureAssetData {
  readonly width: number;
  readonly height: number;
  readonly activeId: string | null;
  readonly layers: readonly TextureLayerRecord[];
}

interface TextureLayer {
  readonly id: string;
  name: string;
  visible: boolean;
  opacity: number;
  color: string;
  pattern: TextureLayerPattern;
  blendMode: TextureBlendMode;
  kind: TextureLayerKind;
  role: TextureLayerRole;
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

function sameState(a: TextureAssetState, b: TextureAssetState): boolean {
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
      layer.pattern === other.pattern &&
      layer.blendMode === other.blendMode &&
      layer.kind === other.kind &&
      layer.role === other.role
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
export interface TextureAssetOptions {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly filter?: TextureFilter;
  readonly checkerA?: string;
  readonly checkerB?: string;
}

/** Supported texture sampling filters. */
export type TextureFilter = 'nearest' | 'linear';

/** One named raster texture and its layer stack. */
export class TextureAsset {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly texture: CanvasTexture;
  private filter: TextureFilter;
  private readonly layers: TextureLayer[] = [];
  private readonly archivedLayers = new Map<string, TextureLayer>();
  private readonly composite: HTMLCanvasElement;
  private readonly compositeContext: CanvasRenderingContext2D;
  private activeId: string | null = null;
  private paintLayerId: string | null = null;
  private previewCanvas: OffscreenCanvas | null = null;
  private previewContext: OffscreenCanvasRenderingContext2D | null = null;
  private paintBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  private readonly checkerA: string;
  private readonly checkerB: string;
  private revision = 0;

  constructor(options: TextureAssetOptions) {
    const width = options.width;
    const height = options.height;
    this.id = options.id;
    this.name = options.name;
    this.width = width;
    this.height = height;
    this.filter = options.filter ?? 'nearest';
    this.checkerA = options.checkerA ?? '#263129';
    this.checkerB = options.checkerB ?? '#c8c2ad';
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
    this.applyFilter();
    this.texture.generateMipmaps = false;
    this.texture.anisotropy = 1;

    const base = this.createLayer('Base', 'solid', '#c8c2ad', 1);
    base.pattern = 'checker';
    this.layers.push(base);
    this.drawLayer(base);
    this.activeId = base.id;
    this.compositeLayers();
  }

  /** Composite image for the UV view background. */
  get image(): HTMLCanvasElement {
    return this.composite;
  }

  /** Number of layers currently in the stack. */
  get layerCount(): number {
    return this.layers.length;
  }

  /** Monotonic revision for diagnostics and snapshots. */
  get version(): number {
    return this.revision;
  }

  /** Current sampling filter. */
  get textureFilter(): TextureFilter {
    return this.filter;
  }

  /** Change sampling without touching pixel content. */
  setFilter(filter: TextureFilter): boolean {
    if (this.filter === filter) {
      return false;
    }
    this.filter = filter;
    this.applyFilter();
    return true;
  }

  /** Active layer ID, if any. */
  get activeLayerId(): string | null {
    return this.activeId;
  }

  /** Deterministic metadata-only snapshots for commands and undo. */
  snapshot(): TextureAssetState {
    return {
      layers: this.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        color: layer.color,
        pattern: layer.pattern,
        blendMode: layer.blendMode,
        kind: layer.kind,
        role: layer.role
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
      pattern: layer.pattern,
      blendMode: layer.blendMode,
      kind: layer.kind,
      role: layer.role
    }));
  }

  /**
   * Apply a metadata snapshot while preserving raster pixels.
   *
   * Fill layers are redrawn from their color/pattern metadata. Raster layers
   * keep their canvases; detached layers are archived so removing and undoing
   * a layer restores its pixels instead of recreating a blank fill.
   */
  applyState(state: TextureAssetState): void {
    const byId = new Map(this.layers.map((layer) => [layer.id, layer]));
    const next: TextureLayer[] = [];
    for (const summary of state.layers) {
      let layer =
        byId.get(summary.id) ??
        this.archivedLayers.get(summary.id);
      this.archivedLayers.delete(summary.id);
      if (!layer) {
        layer = this.createLayer(
          summary.name,
          summary.pattern,
          summary.color,
          summary.opacity,
          summary.id,
          'normal',
          summary.kind
        );
      }
      layer.visible = summary.visible;
      layer.opacity = summary.opacity;
      layer.color = summary.color;
      layer.pattern = summary.pattern;
      layer.blendMode = summary.blendMode;
      layer.kind = summary.kind;
      layer.role = summary.role;
      if (layer.kind === 'fill') {
        this.drawLayer(layer);
      }
      next.push(layer);
      byId.delete(summary.id);
    }
    for (const [id, layer] of byId) {
      this.archivedLayers.set(id, layer);
    }
    this.layers.splice(0, this.layers.length, ...next);
    this.activeId = state.activeId;
    this.compositeLayers();
  }

  /**
   * Start a scratch-layer paint transaction.
   *
   * The committed layer is copied to a preview surface; painting happens there
   * until the gesture commits. The composite substitutes this scratch layer,
   * so previews and erasers look correct without mutating document pixels.
   */
  beginPaint(layerId: string): boolean {
    const layer = this.layers.find((item) => item.id === layerId);
    if (!layer || this.paintLayerId !== null) {
      return false;
    }
    const preview = new OffscreenCanvas(this.width, this.height);
    const context = preview.getContext('2d');
    if (!context) {
      return false;
    }
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(layer.canvas, 0, 0);
    layer.kind = 'raster';
    this.paintLayerId = layerId;
    this.previewCanvas = preview;
    this.previewContext = context;
    this.paintBounds = null;
    return true;
  }

  /** Refresh the composite from the scratch layer while a gesture is live. */
  refreshPreview(): void {
    this.compositeLayers(true);
  }

  /** Scratch context used by paint tools; never the committed layer. */
  getPaintContext(layerId: string): OffscreenCanvasRenderingContext2D | null {
    if (this.paintLayerId !== layerId) {
      return null;
    }
    return this.previewContext;
  }

  /**
   * Mark a region as dirty for the eventual undo patch.
   *
   * Preview drawing does not need before-tile snapshots because the committed
   * layer is untouched. The dirty rectangle keeps the final undo patch local.
   */
  preparePaintRegion(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): void {
    if (this.paintLayerId === null) {
      return;
    }
    const left = Math.max(0, Math.min(this.width, Math.floor(minX)));
    const top = Math.max(0, Math.min(this.height, Math.floor(minY)));
    const right = Math.max(0, Math.min(this.width, Math.ceil(maxX)));
    const bottom = Math.max(0, Math.min(this.height, Math.ceil(maxY)));
    if (right <= left || bottom <= top) {
      return;
    }
    const bounds = this.paintBounds;
    this.paintBounds = bounds
      ? {
          minX: Math.min(bounds.minX, left),
          minY: Math.min(bounds.minY, top),
          maxX: Math.max(bounds.maxX, right),
          maxY: Math.max(bounds.maxY, bottom)
        }
      : { minX: left, minY: top, maxX: right, maxY: bottom };
  }

  /** Reset the scratch layer from the committed layer for a shape preview. */
  restorePaintSnapshot(): boolean {
    const layerId = this.paintLayerId;
    const layer = this.layers.find((item) => item.id === layerId);
    if (!layer || !this.previewCanvas || !this.previewContext) {
      return false;
    }
    this.previewContext.clearRect(0, 0, this.width, this.height);
    this.previewContext.drawImage(layer.canvas, 0, 0);
    this.paintBounds = null;
    this.compositeLayers(true);
    return true;
  }

  /**
   * Paint a circular segment in texture pixels.
   *
   * Legacy UV-pane painting path; it shares the same scratch preview as the
   * modern PaintEngine.
   */
  paintSegment(
    layerId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius: number,
    color: string,
    opacity: number
  ): void {
    const context = this.getPaintContext(layerId);
    if (!context) {
      return;
    }
    const safeRadius = Math.max(0.5, radius);
    this.preparePaintRegion(
      Math.min(fromX, toX) - safeRadius,
      Math.min(fromY, toY) - safeRadius,
      Math.max(fromX, toX) + safeRadius,
      Math.max(fromY, toY) + safeRadius
    );
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, safeRadius * 0.35)));
    context.save();
    context.globalAlpha = Math.min(1, Math.max(0, opacity));
    context.fillStyle = color;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      context.beginPath();
      context.arc(
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
        safeRadius,
        0,
        Math.PI * 2
      );
      context.fill();
    }
    context.restore();
    this.compositeLayers(true);
  }

  /** Flatten the scratch layer into the document and return one undo patch. */
  endPaint(): TexturePaintPatch | null {
    const layerId = this.paintLayerId;
    const layer = this.layers.find((item) => item.id === layerId);
    const bounds = this.paintBounds;
    const preview = this.previewCanvas;
    if (!layer || !preview || !bounds) {
      this.cancelPaint();
      return null;
    }
    const x = Math.max(0, bounds.minX);
    const y = Math.max(0, bounds.minY);
    const width = Math.min(this.width, bounds.maxX) - x;
    const height = Math.min(this.height, bounds.maxY) - y;
    const before = layer.context.getImageData(x, y, width, height);
    layer.context.clearRect(0, 0, this.width, this.height);
    layer.context.drawImage(preview, 0, 0);
    const after = layer.context.getImageData(x, y, width, height);
    this.paintLayerId = null;
    this.previewCanvas = null;
    this.previewContext = null;
    this.paintBounds = null;
    this.compositeLayers();
    return {
      layerId: layer.id,
      x,
      y,
      width,
      height,
      before: before.data.slice(),
      after: after.data.slice()
    };
  }

  /** Discard the scratch layer; committed pixels were never touched. */
  cancelPaint(): void {
    this.paintLayerId = null;
    this.previewCanvas = null;
    this.previewContext = null;
    this.paintBounds = null;
    this.compositeLayers();
  }

  /** Apply a before/after pixel patch for paint undo and redo. */
  applyPaintPatch(patch: TexturePaintPatch, direction: 'before' | 'after'): void {
    const layer = this.layers.find((item) => item.id === patch.layerId);
    if (!layer) {
      return;
    }
    const pixels = direction === 'before' ? patch.before : patch.after;
    layer.context.putImageData(
      new ImageData(
        new Uint8ClampedArray(pixels),
        patch.width,
        patch.height
      ),
      patch.x,
      patch.y
    );
    this.compositeLayers();
  }

  /** Add a raster layer from an imported image, fitted into the texture. */
  async importImageLayer(blob: Blob, name: string): Promise<boolean> {
    const bitmap = await createImageBitmap(blob);
    const layer = this.createLayer(
      name.trim() || 'Imported image',
      'solid',
      '#ffffff',
      1,
      layerId(),
      'normal',
      'raster'
    );
    const context = layer.context;
    context.clearRect(0, 0, this.width, this.height);
    context.imageSmoothingEnabled = this.filter === 'linear';
    const scale = Math.min(
      this.width / bitmap.width,
      this.height / bitmap.height
    );
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (this.width - drawWidth) / 2,
      (this.height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
    bitmap.close();
    this.layers.push(layer);
    this.activeId = layer.id;
    this.compositeLayers();
    return true;
  }

  /** Encode every layer as a binary PNG project payload. */
  async exportData(): Promise<TextureAssetData> {
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
        blendMode: layer.blendMode,
        kind: layer.kind,
        role: layer.role,
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
  async importData(data: TextureAssetData): Promise<void> {
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
        blendMode: record.blendMode ?? 'normal',
        kind: record.kind ?? 'fill',
        role: record.role ?? 'color',
        canvas,
        context
      });
    }
    if (imported.length === 0) {
      this.reset();
      return;
    }
    this.archivedLayers.clear();
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
    this.archivedLayers.clear();
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

  /** Rename a layer with a bounded, non-empty label. */
  setName(id: string, name: string): boolean {
    const layer = this.layers.find((item) => item.id === id);
    const trimmed = name.trim();
    if (!layer || trimmed.length === 0 || trimmed.length > 64 || layer.name === trimmed) {
      return false;
    }
    layer.name = trimmed;
    this.compositeLayers();
    return true;
  }

  /** Set the layer blend mode. */
  setBlendMode(id: string, blendMode: TextureBlendMode): boolean {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || layer.blendMode === blendMode) {
      return false;
    }
    layer.blendMode = blendMode;
    this.compositeLayers();
    return true;
  }

  /** Set a layer's future color/detail/lighting role. */
  setRole(id: string, role: TextureLayerRole): boolean {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer || layer.role === role) {
      return false;
    }
    layer.role = role;
    if (role === 'lighting' && layer.blendMode === 'normal') {
      layer.blendMode = 'multiply';
    }
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
    const [removed] = this.layers.splice(index, 1);
    if (removed) {
      this.archivedLayers.set(removed.id, removed);
    }
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
    layer.kind = 'fill';
    this.drawLayer(layer);
    this.compositeLayers();
    return true;
  }

  /** Release the composite texture and layer canvases. */
  dispose(): void {
    this.texture.dispose();
    this.layers.length = 0;
    this.archivedLayers.clear();
    this.composite.width = 1;
    this.composite.height = 1;
  }

  private applyFilter(): void {
    const filter = this.filter === 'nearest' ? NearestFilter : LinearFilter;
    this.texture.magFilter = filter;
    this.texture.minFilter = filter;
    this.texture.needsUpdate = true;
  }

  private createLayer(
    name: string,
    pattern: TextureLayerPattern,
    color: string,
    opacity: number,
    id = layerId(),
    blendMode: TextureBlendMode = 'normal',
    kind: TextureLayerKind = 'fill',
    role: TextureLayerRole = 'color'
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
      blendMode,
      kind,
      role,
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

  private compositeLayers(usePreview = false): void {
    this.compositeContext.clearRect(0, 0, this.width, this.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }
      this.compositeContext.globalAlpha = layer.opacity;
      this.compositeContext.globalCompositeOperation =
        layer.blendMode === 'multiply'
          ? 'multiply'
          : layer.blendMode === 'screen'
            ? 'screen'
            : 'source-over';
      this.compositeContext.drawImage(
        usePreview && layer.id === this.paintLayerId && this.previewCanvas
          ? this.previewCanvas
          : layer.canvas,
        0,
        0
      );
    }
    this.compositeContext.globalAlpha = 1;
    this.compositeContext.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
    this.revision += 1;
  }
}

/** Undoable metadata transition for the texture stack. */
export class TextureAssetCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly asset: TextureAsset,
    private readonly before: TextureAssetState,
    private readonly after: TextureAssetState,
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
    this.asset.applyState(this.after);
  }

  undo(): void {
    this.asset.applyState(this.before);
  }
}

/** True when two texture stack states are metadata-identical. */
export function textureAssetStatesEqual(
  a: TextureAssetState,
  b: TextureAssetState
): boolean {
  return sameState(a, b);
}

/** The composite texture is the only GPU upload for the stack. */
export function textureAssetTexture(asset: TextureAsset): Texture {
  return asset.texture;
}
