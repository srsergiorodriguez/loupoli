import type { BakeAtlasChart, BakeAtlasPlan } from '../uv/bakeAtlas';
import { bleedImageData, TEXTURE_EDGE_INSET_PIXELS } from './bleed';
import type {
  TextureAssetData,
  TextureFilter,
  TextureLayerRecord
} from './TextureAsset';

interface ChartDraw {
  readonly path: Path2D;
  readonly transform: readonly [number, number, number, number, number, number];
}

/** Source-image to destination-pixel matrix for one bake-atlas chart. */
export function bakeChartImageTransform(
  chart: BakeAtlasChart,
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number
): readonly [number, number, number, number, number, number] {
  const a = (chart.scale * targetWidth) / sourceWidth;
  const d = (chart.scale * targetHeight) / sourceHeight;
  const e = targetWidth * (chart.originU - chart.minU * chart.scale);
  const f =
    targetHeight *
    (1 - (chart.originV + (1 - chart.minV) * chart.scale));
  return [a, 0, 0, d, e, f] as const;
}

/** Shrink a destination face polygon toward its centroid for edge sampling. */
function insetPolygon(
  points: readonly (readonly [number, number])[],
  amount: number
): [number, number][] {
  if (points.length < 3 || amount <= 0) {
    return points.map((point) => [point[0], point[1]]);
  }
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  cx /= points.length;
  cy /= points.length;
  const inset = Math.min(
    amount,
    Math.max(0, Math.min(maxX - minX, maxY - minY) * 0.3)
  );
  if (inset <= 0) {
    return points.map((point) => [point[0], point[1]]);
  }
  return points.map(([x, y]) => {
    const dx = cx - x;
    const dy = cy - y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-6) {
      return [x, y];
    }
    const scale = Math.min(0.5, inset / length);
    return [x + dx * scale, y + dy * scale];
  });
}

function buildChartDraws(
  plan: BakeAtlasPlan,
  sourceWidth: number,
  sourceHeight: number
): ChartDraw[] {
  const draws: ChartDraw[] = [];
  for (const chart of plan.charts) {
    const transform = bakeChartImageTransform(
      chart,
      plan.width,
      plan.height,
      sourceWidth,
      sourceHeight
    );
    for (const face of chart.faces) {
      if (face.length < 3) {
        continue;
      }
      const points = face.map((uv): [number, number] => [
        (chart.originU + (uv[0] - chart.minU) * chart.scale) * plan.width,
        (1 - (chart.originV + (uv[1] - chart.minV) * chart.scale)) *
          plan.height
      ]);
      const inner = insetPolygon(points, TEXTURE_EDGE_INSET_PIXELS);
      const path = new Path2D();
      inner.forEach(([x, y], index) => {
        if (index === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      });
      path.closePath();
      draws.push({ path, transform });
    }
  }
  return draws;
}

/**
 * Rebuild a texture layer stack in the unique bake-atlas layout.
 *
 * Each face is clipped slightly inward from its boundary, then its layer is
 * bled into the cell gutter. The interior mapping is untouched; only the edge
 * strip is replaced with interior color. Mirrored or previously stacked
 * islands retain their painted appearance while receiving independent texels
 * and clean edges.
 */
export async function resampleTextureDataForBakeAtlas(
  data: TextureAssetData,
  plan: BakeAtlasPlan,
  filter: TextureFilter
): Promise<TextureAssetData> {
  const draws = buildChartDraws(plan, data.width, data.height);
  const layers: TextureLayerRecord[] = [];
  for (const source of data.layers) {
    const pngBuffer = source.png.buffer.slice(
      source.png.byteOffset,
      source.png.byteOffset + source.png.byteLength
    ) as ArrayBuffer;
    const bitmap = await createImageBitmap(
      new Blob([pngBuffer], { type: 'image/png' })
    );
    const canvas = new OffscreenCanvas(plan.width, plan.height);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Unable to create the bake atlas layer.');
    }
    context.clearRect(0, 0, plan.width, plan.height);
    context.imageSmoothingEnabled = filter === 'linear';
    for (const draw of draws) {
      context.save();
      context.clip(draw.path);
      context.setTransform(...draw.transform);
      context.drawImage(bitmap, 0, 0);
      context.restore();
    }
    const pixels = context.getImageData(
      0,
      0,
      plan.width,
      plan.height
    );
    bleedImageData(pixels.data, plan.width, plan.height);
    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    bitmap.close();
    layers.push({
      ...source,
      png: new Uint8Array(await blob.arrayBuffer())
    });
  }
  return {
    width: plan.width,
    height: plan.height,
    activeId: data.activeId,
    layers
  };
}
