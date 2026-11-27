import type { TextureAsset } from '../texture/TextureAsset';
import type { ProjectedPaintMesh } from '../render/PaintProjection';
import {
  getGpuProjectedPaintSurface,
  type GpuProjectedPaintSurface,
  type ProjectedPaintBounds
} from './GpuProjectedPaintSurface';
import { StrokeSampler, type StrokeDab } from './StrokeSampler';
import { strokeRandom } from './brush';
import type { PaintSample, PaintSettings } from './types';

function includeBounds(
  current: ProjectedPaintBounds | null,
  next: ProjectedPaintBounds
): ProjectedPaintBounds {
  if (!current) {
    return { ...next };
  }
  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY)
  };
}

/**
 * One projected texture-paint gesture.
 *
 * The brush is generated in screen space, rasterized into a screen mask, then
 * projected through the evaluated mesh into a texture-space coverage mask. The
 * same screen dab therefore reaches every face under it, so a stroke crossing
 * a UV seam is continuous by construction instead of being stitched from
 * independent texture-space circles.
 */
export class ProjectedPaintSession {
  private readonly surface: GpuProjectedPaintSurface | null;
  private readonly ready: boolean;
  private readonly sampler: StrokeSampler;
  private readonly settings: PaintSettings;
  private active = false;
  private bounds: ProjectedPaintBounds | null = null;

  constructor(
    private readonly asset: TextureAsset,
    private readonly layerId: string,
    settings: PaintSettings,
    mesh: ProjectedPaintMesh,
    viewWidth: number,
    viewHeight: number,
    screenRadius: number
  ) {
    this.settings = settings;
    this.surface = getGpuProjectedPaintSurface();
    this.sampler = new StrokeSampler({
      radius: screenRadius,
      hardness: settings.hardness,
      spacing: settings.spacing,
      smoothing: settings.smoothing,
      noise: settings.noise,
      pressureOpacity: settings.pressureOpacity,
      pressureCurve: settings.pressureCurve,
      pressureMin: settings.pressureMin,
      tiltEnabled: settings.tiltEnabled,
      taperIn: settings.taperIn,
      random: strokeRandom(
        (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
      )
    });
    this.ready =
      this.surface?.begin(
        asset.width,
        asset.height,
        viewWidth,
        viewHeight,
        settings,
        mesh
      ) ?? false;
  }

  /** Start the transaction and apply the initial dab. */
  begin(sample: PaintSample): boolean {
    if (!this.ready || !this.surface || !this.asset.beginPaint(this.layerId)) {
      return false;
    }
    this.active = true;
    this.paintDabs(this.sampler.begin(sample));
    return true;
  }

  /** Continue the screen-space stroke and project the new dabs. */
  addBatch(samples: readonly PaintSample[]): boolean {
    if (!this.active || samples.length === 0) {
      return false;
    }
    const dabs: StrokeDab[] = [];
    for (const sample of samples) {
      dabs.push(...this.sampler.add(sample));
    }
    return this.paintDabs(dabs);
  }

  /** Flush the final dab and return the accumulated texture-space dirty area. */
  finish(): ProjectedPaintBounds | null {
    if (!this.active) {
      return null;
    }
    this.paintDabs(this.sampler.finish());
    this.active = false;
    return this.bounds;
  }

  /** Discard the transaction and both GPU masks. */
  cancel(): void {
    this.surface?.reset();
    this.active = false;
    this.bounds = null;
    this.asset.cancelPaint();
  }

  private paintDabs(dabs: readonly StrokeDab[]): boolean {
    if (!this.surface || dabs.length === 0) {
      return false;
    }
    this.surface.addDabs(dabs);
    const next = this.surface.render();
    if (!next) {
      return false;
    }
    const source = this.surface.present(next);
    if (!source) {
      return false;
    }
    this.bounds = includeBounds(this.bounds, next);
    this.asset.preparePaintRegion(
      next.minX,
      next.minY,
      next.maxX,
      next.maxY
    );
    this.asset.resetPaintRegion(next.minX, next.minY, next.maxX, next.maxY);
    this.asset.applyPaintOverlay(
      next.minX,
      next.minY,
      next.maxX,
      next.maxY,
      source,
      this.settings.tool === 'eraser'
    );
    this.asset.refreshPreviewRegion(
      next.minX,
      next.minY,
      next.maxX,
      next.maxY
    );
    return true;
  }
}
