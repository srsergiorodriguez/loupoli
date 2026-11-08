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

/** Pixels sampled inward before the outward bleed. */
const EDGE_DONOR_PIXELS = 1;
/** Gutter filled around every UV island. */
const EDGE_BLEED_PIXELS = 4;

/** Build the exact placed face paths for every chart. */
function buildChartPaths(plan: BakeAtlasPlan): Path2D[] {
  return plan.charts.map((chart) => {
    const path = new Path2D();
    for (const face of chart.faces) {
      face.forEach((uv, index) => {
        const x =
          (chart.originU + (uv[0] - chart.minU) * chart.scale) *
          plan.width;
        const y =
          (1 -
            (chart.originV + (uv[1] - chart.minV) * chart.scale)) *
          plan.height;
        if (index === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      });
      path.closePath();
    }
    return path;
  });
}

/** Erode a binary coverage mask by a whole-pixel radius. */
export function erodeCoverage(
  coverage: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  let current = new Uint8Array(width * height);
  for (let pixel = 0; pixel < current.length; pixel += 1) {
    current[pixel] = coverage[pixel * 4 + 3] > 0 ? 1 : 0;
  }
  for (let pass = 0; pass < radius; pass += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (current[pixel] === 0) {
          continue;
        }
        if (
          x === 0 ||
          x === width - 1 ||
          y === 0 ||
          y === height - 1 ||
          current[pixel - 1] === 0 ||
          current[pixel + 1] === 0 ||
          current[pixel - width] === 0 ||
          current[pixel + width] === 0
        ) {
          next[pixel] = 0;
        }
      }
    }
    current = next;
  }
  // Thin low-poly strips can be narrower than twice the donor radius. Preserve
  // their original pixels when no surviving core pixel is within reach.
  const search = Math.max(1, radius + 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (current[pixel] !== 0 || coverage[pixel * 4 + 3] === 0) {
        continue;
      }
      let hasCore = false;
      for (let oy = -search; oy <= search && !hasCore; oy += 1) {
        const ny = y + oy;
        if (ny < 0 || ny >= height) {
          continue;
        }
        for (let ox = -search; ox <= search; ox += 1) {
          const nx = x + ox;
          if (nx < 0 || nx >= width) {
            continue;
          }
          if (current[ny * width + nx] !== 0) {
            hasCore = true;
            break;
          }
        }
      }
      if (!hasCore) {
        current[pixel] = 1;
      }
    }
  }
  return current;
}

/**
 * Bleed a one-texel-inside donor across the UV boundary and its gutter.
 *
 * Only the allowed boundary band changes, never the island interior. This
 * prevents filtered or sub-texel-offset samples from reaching the source
 * backdrop without distorting UVs or repainting the island.
 */
function bleedIslandEdges(
  pixels: Uint8ClampedArray,
  core: Uint8Array,
  allowed: Uint8Array,
  width: number,
  height: number
): void {
  const count = width * height;
  const filled = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    if (core[pixel] === 0) {
      continue;
    }
    const offset = pixel * 4;
    if (pixels[offset + 3] === 0) {
      continue;
    }
    filled[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }
  while (head < tail) {
    const donor = queue[head];
    head += 1;
    const x = donor % width;
    const y = Math.floor(donor / width);
    const donorOffset = donor * 4;
    const tryTarget = (target: number): void => {
      if (filled[target] !== 0 || allowed[target] === 0) {
        return;
      }
      const targetOffset = target * 4;
      pixels[targetOffset] = pixels[donorOffset];
      pixels[targetOffset + 1] = pixels[donorOffset + 1];
      pixels[targetOffset + 2] = pixels[donorOffset + 2];
      pixels[targetOffset + 3] = 255;
      filled[target] = 1;
      queue[tail] = target;
      tail += 1;
    };
    if (x > 0) tryTarget(donor - 1);
    if (x < width - 1) tryTarget(donor + 1);
    if (y > 0) tryTarget(donor - width);
    if (y < height - 1) tryTarget(donor + width);
  }
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
  const chartPaths = buildChartPaths(plan);
  const coverageCanvas = new OffscreenCanvas(plan.width, plan.height);
  const coverageContext = coverageCanvas.getContext('2d', {
    willReadFrequently: true
  });
  let core: Uint8Array | null = null;
  let allowed: Uint8Array | null = null;
  if (coverageContext) {
    coverageContext.fillStyle = '#fff';
    for (const path of chartPaths) {
      coverageContext.fill(path);
    }
    const coverage = coverageContext.getImageData(
      0,
      0,
      plan.width,
      plan.height
    );
    core = erodeCoverage(
      coverage.data,
      plan.width,
      plan.height,
      EDGE_DONOR_PIXELS
    );
    const allowedCanvas = new OffscreenCanvas(plan.width, plan.height);
    const allowedContext = allowedCanvas.getContext('2d', {
      willReadFrequently: true
    });
    if (allowedContext) {
      allowedContext.fillStyle = '#fff';
      allowedContext.strokeStyle = '#fff';
      allowedContext.lineWidth = EDGE_BLEED_PIXELS * 2;
      allowedContext.lineJoin = 'round';
      for (const path of chartPaths) {
        allowedContext.fill(path);
        allowedContext.stroke(path);
      }
      const allowedImage = allowedContext.getImageData(
        0,
        0,
        plan.width,
        plan.height
      );
      allowed = new Uint8Array(plan.width * plan.height);
      for (let pixel = 0; pixel < allowed.length; pixel += 1) {
        allowed[pixel] =
          allowedImage.data[pixel * 4 + 3] > 0 ? 1 : 0;
      }
    }
  }
  const layers: TextureLayerRecord[] = [];
  for (const source of data.layers) {
    if (source.kind === 'effect') {
      layers.push({ ...source });
      continue;
    }
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
    if (core && allowed) {
      const pixels = context.getImageData(
        0,
        0,
        plan.width,
        plan.height
      );
      bleedIslandEdges(
        pixels.data,
        core,
        allowed,
        plan.width,
        plan.height
      );
      context.putImageData(pixels, 0, 0);
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
