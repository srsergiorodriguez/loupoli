import type { BakeAtlasChart, BakeAtlasPlan } from '../uv/bakeAtlas';
import type {
  TextureAssetData,
  TextureFilter,
  TextureLayerRecord
} from './TextureAsset';

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

/** Destination pixel bounds of a chart's placed UV faces. */
function chartBounds(
  chart: BakeAtlasChart,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const face of chart.faces) {
    for (const uv of face) {
      const x = (chart.originU + (uv[0] - chart.minU) * chart.scale) * width;
      const y =
        (1 - (chart.originV + (uv[1] - chart.minV) * chart.scale)) * height;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Rebuild a texture layer stack in the unique bake-atlas layout.
 *
 * Each layer is transformed through the chart placement clips, so mirrored or
 * previously stacked islands retain their painted appearance while receiving
 * independent texels.
 */
export async function resampleTextureDataForBakeAtlas(
  data: TextureAssetData,
  plan: BakeAtlasPlan,
  filter: TextureFilter
): Promise<TextureAssetData> {
  const transforms = plan.charts.map((chart) => ({
    chart,
    transform: bakeChartImageTransform(
      chart,
      plan.width,
      plan.height,
      data.width,
      data.height
    ),
    bounds: chartBounds(chart, plan.width, plan.height)
  }));
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
    for (const { transform, bounds } of transforms) {
      if (bounds.width <= 0 || bounds.height <= 0) {
        continue;
      }
      context.save();
      // A rectangular clip preserves a continuous image across every face in
      // the island. Per-face clipping introduced hairline gaps that showed up
      // as white seams after filtering.
      context.beginPath();
      context.rect(
        bounds.x - 4,
        bounds.y - 4,
        bounds.width + 8,
        bounds.height + 8
      );
      context.clip();
      context.setTransform(...transform);
      context.drawImage(bitmap, 0, 0);
      context.restore();
    }
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
