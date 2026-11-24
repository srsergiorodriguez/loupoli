import type { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import { packUvChartRects } from '../geometry/lscm';
import type { TextureAsset } from './TextureAsset';

/** One textured object prepared for export-atlas packing. */
export interface ExportAtlasEntry {
  readonly nodeId: string;
  readonly mesh: HalfEdgeMesh;
  readonly asset: TextureAsset;
}

/** Per-node UV remap into the shared export atlas. */
export interface ExportUvTransform {
  readonly offsetU: number;
  readonly offsetV: number;
  readonly scale: number;
}

/** Atlas image and UV remaps produced for one export. */
export interface ExportAtlasResult {
  readonly textureId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly transforms: ReadonlyMap<string, ExportUvTransform>;
}

/** Atlas size choices accepted by the export dialog. */
export type ExportAtlasSize = 'auto' | '1024' | '2048' | '4096';

interface PreparedEntry {
  readonly entry: ExportAtlasEntry;
  readonly minU: number;
  readonly minV: number;
  readonly spanU: number;
  readonly spanV: number;
}

function prepareEntry(entry: ExportAtlasEntry): PreparedEntry | null {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let corner = 0; corner < entry.mesh.halfEdgeCount; corner += 1) {
    const u = entry.mesh.heUv[corner * 2];
    const v = entry.mesh.heUv[corner * 2 + 1];
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return null;
    }
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  const spanU = maxU - minU;
  const spanV = maxV - minV;
  if (!Number.isFinite(spanU) || !Number.isFinite(spanV) || spanU <= 1e-6 || spanV <= 1e-6) {
    return null;
  }
  return { entry, minU, minV, spanU, spanV };
}

function chooseAtlasSize(
  size: ExportAtlasSize,
  entries: readonly PreparedEntry[]
): number {
  if (size !== 'auto') {
    return Number(size);
  }
  const largest = entries.reduce(
    (value, entry) => Math.max(value, entry.entry.asset.width, entry.entry.asset.height),
    1024
  );
  return Math.min(4096, Math.max(1024, largest));
}

/** Encode one image source to PNG bytes. */
async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) {
    throw new Error('The export atlas PNG could not be encoded.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/** Draw one atlas cell and a small edge bleed so filtering cannot sample empty pixels. */
function drawAtlasCell(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  bleed: number
): void {
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight, x, y, width, height);
  if (bleed <= 0 || width <= 1 || height <= 1) {
    return;
  }
  const edge = Math.max(1, Math.min(2, Math.floor(Math.min(width, height) / 8)));
  context.drawImage(image, 0, 0, edge, sourceHeight, x - bleed, y, bleed, height);
  context.drawImage(
    image,
    sourceWidth - edge,
    0,
    edge,
    sourceHeight,
    x + width,
    y,
    bleed,
    height
  );
  context.drawImage(image, 0, 0, sourceWidth, edge, x, y - bleed, width, bleed);
  context.drawImage(
    image,
    0,
    sourceHeight - edge,
    sourceWidth,
    edge,
    x,
    y + height,
    width,
    bleed
  );
  context.drawImage(image, 0, 0, edge, edge, x - bleed, y - bleed, bleed, bleed);
  context.drawImage(
    image,
    sourceWidth - edge,
    0,
    edge,
    edge,
    x + width,
    y - bleed,
    bleed,
    bleed
  );
  context.drawImage(
    image,
    0,
    sourceHeight - edge,
    edge,
    edge,
    x - bleed,
    y + height,
    bleed,
    bleed
  );
  context.drawImage(
    image,
    sourceWidth - edge,
    sourceHeight - edge,
    edge,
    edge,
    x + width,
    y + height,
    bleed,
    bleed
  );
}

/**
 * Build a temporary one-texture atlas for export.
 *
 * This never mutates the document, texture library, or UV columns. Each object
 * keeps its own cell, so repeated or overlapping UVs remain independent.
 */
export async function buildExportAtlas(
  entries: readonly ExportAtlasEntry[],
  size: ExportAtlasSize,
  baseName: string
): Promise<ExportAtlasResult | null> {
  const prepared = entries
    .map(prepareEntry)
    .filter((entry): entry is PreparedEntry => entry !== null);
  if (prepared.length === 0) {
    return null;
  }
  const placements = packUvChartRects(
    prepared.map((entry, index) => ({
      index,
      spanU: entry.spanU,
      spanV: entry.spanV
    }))
  );
  if (!placements) {
    throw new Error('The object UV layouts could not be packed into one atlas.');
  }
  const dimension = chooseAtlasSize(size, prepared);
  const canvas = document.createElement('canvas');
  canvas.width = dimension;
  canvas.height = dimension;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The export atlas canvas could not be created.');
  }
  context.clearRect(0, 0, dimension, dimension);
  const transforms = new Map<string, ExportUvTransform>();
  for (let index = 0; index < prepared.length; index += 1) {
    const entry = prepared[index];
    const placement = placements[index];
    const x = placement.originU * dimension;
    const y = (1 - (placement.originV + entry.spanV * placement.scale)) * dimension;
    const width = entry.spanU * placement.scale * dimension;
    const height = entry.spanV * placement.scale * dimension;
    if (width <= 0 || height <= 0) {
      continue;
    }
    const bleed = Math.min(4, Math.floor(Math.min(width, height) * 0.08));
    context.save();
    context.beginPath();
    context.rect(x - bleed, y - bleed, width + bleed * 2, height + bleed * 2);
    context.clip();
    context.imageSmoothingEnabled = entry.entry.asset.textureFilter === 'linear';
    drawAtlasCell(
      context,
      entry.entry.asset.image,
      entry.entry.asset.image.width,
      entry.entry.asset.image.height,
      x,
      y,
      width,
      height,
      bleed
    );
    context.restore();
    transforms.set(entry.entry.nodeId, {
      offsetU: placement.originU - entry.minU * placement.scale,
      offsetV: placement.originV - entry.minV * placement.scale,
      scale: placement.scale
    });
  }
  const bytes = await encodePng(canvas);
  const safeBase =
    baseName.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'loupoli';
  return {
    textureId: '__export-atlas__',
    fileName: `${safeBase}-atlas.png`,
    bytes,
    width: dimension,
    height: dimension,
    transforms
  };
}
