import type { BakeAtlasChart, BakeAtlasPlan } from '../uv/bakeAtlas';
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
  targetSize: number,
  sourceWidth: number,
  sourceHeight: number
): readonly [number, number, number, number, number, number] {
  const a = (chart.scale * targetSize) / sourceWidth;
  const d = (chart.scale * targetSize) / sourceHeight;
  const e = targetSize * (chart.originU - chart.minU * chart.scale);
  const f =
    targetSize *
    (1 - (chart.originV + (1 - chart.minV) * chart.scale));
  return [a, 0, 0, d, e, f] as const;
}

function buildChartDraws(
  plan: BakeAtlasPlan,
  sourceWidth: number,
  sourceHeight: number
): ChartDraw[] {
  return plan.charts.map((chart) => {
    const path = new Path2D();
    for (const face of chart.faces) {
      if (face.length < 3) {
        continue;
      }
      face.forEach((uv, index) => {
        const x =
          (chart.originU + (uv[0] - chart.minU) * chart.scale) *
          plan.targetSize;
        const y =
          (1 -
            (chart.originV + (uv[1] - chart.minV) * chart.scale)) *
          plan.targetSize;
        if (index === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      });
      path.closePath();
    }
    return {
      path,
      transform: bakeChartImageTransform(
        chart,
        plan.targetSize,
        sourceWidth,
        sourceHeight
      )
    };
  });
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
    const canvas = new OffscreenCanvas(plan.targetSize, plan.targetSize);
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Unable to create the bake atlas layer.');
    }
    context.clearRect(0, 0, plan.targetSize, plan.targetSize);
    context.imageSmoothingEnabled = filter === 'linear';
    for (const draw of draws) {
      context.save();
      context.clip(draw.path);
      context.setTransform(...draw.transform);
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
    width: plan.targetSize,
    height: plan.targetSize,
    activeId: data.activeId,
    layers
  };
}
