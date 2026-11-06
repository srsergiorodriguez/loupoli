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
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cy = 0;
      for (const [x, y] of points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        cx += x;
        cy += y;
      }
      cx /= points.length;
      cy /= points.length;
      const minDimension = Math.min(maxX - minX, maxY - minY);
      const inset = Math.min(
        TEXTURE_EDGE_INSET_PIXELS,
        Math.max(0, minDimension * 0.3)
      );
      const scale =
        inset > 0
          ? Math.min(
              1.9,
              1 / Math.max(0.1, 1 - (2 * inset) / minDimension)
            )
          : 1;
      const path = new Path2D();
      points.forEach(([x, y], index) => {
        if (index === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      });
      path.closePath();
      // Enlarge the sampled source around the face center. The clip stays on
      // the exact face, so boundary pixels come from inside the island instead
      // of its background gutter; the bleed then fills the cell gutter.
      draws.push({
        path,
        transform: [
          transform[0] * scale,
          0,
          0,
          transform[3] * scale,
          transform[4] * scale + (1 - scale) * cx,
          transform[5] * scale + (1 - scale) * cy
        ]
      });
    }
  }
  return draws;
}

/**
 * Rebuild a texture layer stack in the unique bake-atlas layout.
 *
 * Each face is sampled slightly inward from its boundary, then its layer is
 * bled into the cell gutter. Mirrored or previously stacked islands retain
 * their painted appearance while receiving independent texels and clean edges.
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
