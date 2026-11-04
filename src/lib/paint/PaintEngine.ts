import type { TextureAsset } from '../texture/TextureAsset';
import { drawStamp, drawStampLine, strokeRandom } from './brush';
import type { PaintSample, PaintSettings } from './types';

interface PaintBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyBounds(): PaintBounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function include(
  bounds: PaintBounds,
  next: { minX: number; minY: number; maxX: number; maxY: number }
): PaintBounds {
  return {
    minX: Math.min(bounds.minX, next.minX),
    minY: Math.min(bounds.minY, next.minY),
    maxX: Math.max(bounds.maxX, next.maxX),
    maxY: Math.max(bounds.maxY, next.maxY)
  };
}

/**
 * One pointer gesture on one raster texture layer.
 *
 * The engine owns brush smoothing, stamp spacing, shape/gradient previews, and
 * the single transaction that becomes one paint command. Pointer coordinates
 * are texture pixels, not canvas CSS pixels.
 */
export class PaintEngine {
  private context: OffscreenCanvasRenderingContext2D | null = null;
  private readonly random = strokeRandom(
    (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
  );
  private start: PaintSample | null = null;
  private last: PaintSample | null = null;
  private filtered: PaintSample | null = null;
  private lastStamp: PaintSample | null = null;
  private bounds = emptyBounds();
  private changed = false;
  private manual = false;

  constructor(
    private readonly asset: TextureAsset,
    private readonly layerId: string,
    private readonly settings: PaintSettings
  ) {}

  /** Start a gesture and return false when the target layer is unavailable. */
  begin(sample: PaintSample): boolean {
    this.manual = false;
    if (!this.asset.beginPaint(this.layerId)) {
      return false;
    }
    this.context = this.asset.getPaintContext(this.layerId);
    if (!this.context) {
      this.asset.cancelPaint();
      return false;
    }
    this.start = sample;
    this.last = sample;
    this.filtered = sample;
    this.lastStamp = sample;
    if (this.settings.tool === 'fill') {
      this.changed = this.floodFill(sample);
    } else if (this.settings.tool === 'brush' || this.settings.tool === 'eraser') {
      this.stamp(sample, sample);
    }
    this.asset.refreshPreview();
    return true;
  }

  /** Continue an active gesture. */
  update(sample: PaintSample): void {
    if (!this.context || !this.start) {
      return;
    }
    this.last = sample;
    const tool = this.settings.tool;
    if (tool === 'brush' || tool === 'eraser') {
      this.stamp(this.filtered ?? this.start, sample);
      this.asset.refreshPreview();
      return;
    }
    if (tool === 'fill') {
      return;
    }
    this.asset.restorePaintSnapshot();
    this.bounds = emptyBounds();
    this.drawPreview(sample);
    this.asset.refreshPreview();
  }

  /**
   * Start a manual projected gesture without drawing an initial dab.
   *
   * Line/shape/gradient tools sample their screen-space region on release and
   * call `stampProjected` for each surface hit. `finish` must not add its own
   * connecting brush segment for this transaction.
   */
  beginProjected(sample: PaintSample): boolean {
    this.manual = true;
    if (!this.asset.beginPaint(this.layerId)) {
      return false;
    }
    this.context = this.asset.getPaintContext(this.layerId);
    if (!this.context) {
      this.asset.cancelPaint();
      return false;
    }
    this.start = sample;
    this.last = sample;
    this.filtered = sample;
    this.lastStamp = sample;
    return true;
  }

  /** Stamp one independently sampled projected dab. */
  stampProjected(
    x: number,
    y: number,
    radius: number,
    pressure: number,
    color?: string
  ): void {
    if (!this.context) {
      return;
    }
    const safeRadius = Math.max(0.5, radius);
    const margin = safeRadius * (1 + this.settings.noise) + 2;
    this.asset.preparePaintRegion(
      x - margin,
      y - margin,
      x + margin,
      y + margin
    );
    const settings = color
      ? { ...this.settings, color }
      : this.settings;
    const bounds = drawStamp(
      this.context,
      x,
      y,
      safeRadius,
      settings,
      pressure,
      this.random,
      this.settings.tool === 'eraser'
    );
    this.bounds = include(this.bounds, bounds);
    this.changed = true;
  }

  /**
   * Continue a projected surface stroke.
   *
   * `connect` is false across a face boundary or after the pointer left the
   * mesh. A disconnected sample still stamps one dab but never draws a line
   * through unrelated UV-island space.
   */
  updateProjected(sample: PaintSample, connect: boolean): void {
    if (!this.context || !this.start || this.manual) {
      return;
    }
    this.last = sample;
    if (this.settings.tool !== 'brush' && this.settings.tool !== 'eraser') {
      return;
    }
    if (connect) {
      this.stamp(this.filtered ?? this.start, sample);
    } else {
      this.filtered = sample;
      this.lastStamp = sample;
      this.stamp(sample, sample);
    }
    this.asset.refreshPreview();
  }

  /** Finish the gesture and return the dirty bounds, if anything changed. */
  finish(): PaintBounds | null {
    if (!this.context || !this.start) {
      return null;
    }
    if (this.manual) {
      this.changed = this.changed || this.bounds.minX !== Infinity;
      this.asset.refreshPreview();
      this.context = null;
      return this.changed ? this.bounds : null;
    }
    const tool = this.settings.tool;
    if (tool !== 'fill' && tool !== 'brush' && tool !== 'eraser' && this.last) {
      this.asset.restorePaintSnapshot();
      this.bounds = emptyBounds();
      this.drawPreview(this.last);
    }
    if (tool === 'brush' || tool === 'eraser') {
      if (this.last && this.filtered) {
        this.stamp(this.filtered, this.last);
      }
    }
    this.changed = this.changed || this.bounds.minX !== Infinity;
    this.asset.refreshPreview();
    this.context = null;
    return this.changed ? this.bounds : null;
  }

  /** Discard the transaction and restore pre-stroke pixels. */
  cancel(): void {
    this.context = null;
    this.manual = false;
    this.asset.cancelPaint();
  }

  private stamp(from: PaintSample, to: PaintSample): void {
    if (!this.context) {
      return;
    }
    const smoothing = Math.min(0.96, Math.max(0, this.settings.smoothing) * 0.9);
    const target = this.filtered ?? from;
    const filtered: PaintSample = {
      x: target.x + (to.x - target.x) * (1 - smoothing),
      y: target.y + (to.y - target.y) * (1 - smoothing),
      pressure: to.pressure
    };
    const last = this.lastStamp ?? from;
    const margin = this.settings.radius * (1 + this.settings.noise) + 2;
    this.asset.preparePaintRegion(
      Math.min(last.x, filtered.x) - margin,
      Math.min(last.y, filtered.y) - margin,
      Math.max(last.x, filtered.x) + margin,
      Math.max(last.y, filtered.y) + margin
    );
    const bounds = drawStampLine(
      this.context,
      last.x,
      last.y,
      filtered.x,
      filtered.y,
      this.settings.radius,
      this.settings,
      to.pressure,
      this.random,
      this.settings.tool === 'eraser'
    );
    this.lastStamp = filtered;
    this.filtered = filtered;
    this.bounds = include(this.bounds, bounds);
    this.changed = true;
  }

  private drawPreview(sample: PaintSample): void {
    if (!this.context || !this.start) {
      return;
    }
    const tool = this.settings.tool;
    if (tool === 'line') {
      const margin = this.settings.radius * (1 + this.settings.noise) + 2;
      this.asset.preparePaintRegion(
        Math.min(this.start.x, sample.x) - margin,
        Math.min(this.start.y, sample.y) - margin,
        Math.max(this.start.x, sample.x) + margin,
        Math.max(this.start.y, sample.y) + margin
      );
      const bounds = drawStampLine(
        this.context,
        this.start.x,
        this.start.y,
        sample.x,
        sample.y,
        this.settings.radius,
        this.settings,
        1,
        this.random,
        false
      );
      this.mark(bounds);
      return;
    }
    if (tool === 'rectangle' || tool === 'ellipse') {
      this.drawShape(this.start, sample, tool === 'ellipse');
      return;
    }
    if (tool === 'gradient') {
      this.drawGradient(this.start, sample);
    }
  }

  private drawShape(
    from: PaintSample,
    to: PaintSample,
    ellipse: boolean
  ): void {
    if (!this.context) {
      return;
    }
    const context = this.context;
    const minX = Math.min(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxX = Math.max(from.x, to.x);
    const maxY = Math.max(from.y, to.y);
    const margin = this.settings.radius * (1 + this.settings.noise) + 2;
    this.asset.preparePaintRegion(
      minX - margin,
      minY - margin,
      maxX + margin,
      maxY + margin
    );
    if (this.settings.shapeFilled) {
      context.save();
      context.globalAlpha = this.settings.opacity;
      context.fillStyle = this.settings.color;
      context.beginPath();
      if (ellipse) {
        context.ellipse(
          (minX + maxX) / 2,
          (minY + maxY) / 2,
          Math.abs(maxX - minX) / 2,
          Math.abs(maxY - minY) / 2,
          0,
          0,
          Math.PI * 2
        );
      } else {
        context.rect(minX, minY, maxX - minX, maxY - minY);
      }
      context.fill();
      context.restore();
      this.mark({ minX, minY, maxX, maxY });
      return;
    }
    if (ellipse) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radiusX = Math.max(0.5, Math.abs(maxX - minX) / 2);
      const radiusY = Math.max(0.5, Math.abs(maxY - minY) / 2);
      let previous: PaintSample | null = null;
      for (let index = 0; index <= 96; index += 1) {
        const angle = (index / 96) * Math.PI * 2;
        const point = {
          x: centerX + Math.cos(angle) * radiusX,
          y: centerY + Math.sin(angle) * radiusY,
          pressure: 1
        };
        if (previous) {
          const stamp = drawStampLine(
            context,
            previous.x,
            previous.y,
            point.x,
            point.y,
            this.settings.radius,
            this.settings,
            1,
            this.random,
            false
          );
          this.mark(stamp);
        }
        previous = point;
      }
      return;
    }
    const corners = [
      { x: minX, y: minY, pressure: 1 },
      { x: maxX, y: minY, pressure: 1 },
      { x: maxX, y: maxY, pressure: 1 },
      { x: minX, y: maxY, pressure: 1 }
    ];
    for (let index = 0; index < corners.length; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % corners.length];
      const stamp = drawStampLine(
        context,
        a.x,
        a.y,
        b.x,
        b.y,
        this.settings.radius,
        this.settings,
        1,
        this.random,
        false
      );
      this.mark(stamp);
    }
  }

  private drawGradient(from: PaintSample, to: PaintSample): void {
    if (!this.context) {
      return;
    }
    const context = this.context;
    const width = this.asset.width;
    const height = this.asset.height;
    this.asset.preparePaintRegion(0, 0, width, height);
    const gradient =
      this.settings.gradient === 'radial'
        ? context.createRadialGradient(
            from.x,
            from.y,
            1,
            from.x,
            from.y,
            Math.max(1, Math.hypot(to.x - from.x, to.y - from.y))
          )
        : context.createLinearGradient(from.x, from.y, to.x, to.y);
    gradient.addColorStop(0, this.settings.color);
    gradient.addColorStop(1, this.settings.secondaryColor);
    context.save();
    context.globalAlpha = this.settings.opacity;
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
    this.mark({ minX: 0, minY: 0, maxX: width, maxY: height });
  }

  private floodFill(sample: PaintSample): boolean {
    if (!this.context) {
      return false;
    }
    const width = this.asset.width;
    const height = this.asset.height;
    const x = Math.max(0, Math.min(width - 1, Math.floor(sample.x)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(sample.y)));
    const image = this.context.getImageData(0, 0, width, height);
    const data = image.data;
    const start = (y * width + x) * 4;
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
    const fill = this.hexColor(this.settings.color, this.settings.opacity);
    if (
      target[0] === fill[0] &&
      target[1] === fill[1] &&
      target[2] === fill[2] &&
      target[3] === fill[3]
    ) {
      return false;
    }
    this.asset.preparePaintRegion(0, 0, width, height);
    const stack: number[] = [x, y];
    const seen = new Uint8Array(width * height);
    let minX = x;
    let minY = y;
    let maxX = x;
    let maxY = y;
    while (stack.length > 0) {
      const py = stack.pop() as number;
      const px = stack.pop() as number;
      if (px < 0 || py < 0 || px >= width || py >= height) {
        continue;
      }
      const index = py * width + px;
      if (seen[index] !== 0) {
        continue;
      }
      const offset = index * 4;
      if (
        data[offset] !== target[0] ||
        data[offset + 1] !== target[1] ||
        data[offset + 2] !== target[2] ||
        data[offset + 3] !== target[3]
      ) {
        continue;
      }
      seen[index] = 1;
      data[offset] = fill[0];
      data[offset + 1] = fill[1];
      data[offset + 2] = fill[2];
      data[offset + 3] = fill[3];
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px + 1);
      maxY = Math.max(maxY, py + 1);
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
    this.context.putImageData(image, 0, 0);
    this.mark({ minX, minY, maxX, maxY });
    this.changed = true;
    return true;
  }

  private hexColor(color: string, opacity: number): [number, number, number, number] {
    const hex = color.replace('#', '');
    if (hex.length !== 6) {
      return [255, 255, 255, Math.round(255 * opacity)];
    }
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      Math.round(255 * Math.min(1, Math.max(0, opacity)))
    ];
  }

  private mark(bounds: PaintBounds): void {
    this.bounds = include(this.bounds, bounds);
  }
}
