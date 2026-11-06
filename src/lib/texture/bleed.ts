/** Pixels of edge color copied outside UV coverage to stop filtered seams. */
export const TEXTURE_BLEED_PIXELS = 8;

/** Pixels clipped inward before bleeding interior color outward. */
export const TEXTURE_EDGE_INSET_PIXELS = 10;

/**
 * Extend non-transparent pixels into adjacent transparent pixels.
 *
 * Resampled face content is inset from its UV boundary. Without a gutter,
 * linear filtering at a chart edge samples transparent pixels and produces
 * white or dark lines. This dilation copies edge RGBA into the surrounding
 * padding while leaving the interior untouched.
 */
export function bleedImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  passes = TEXTURE_BLEED_PIXELS
): void {
  const count = width * height;
  if (count === 0 || data.length < count * 4) {
    return;
  }
  const maxPass = Math.max(0, Math.floor(passes));
  if (maxPass === 0) {
    return;
  }
  const filled = new Uint8Array(count);
  const depth = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    if (data[pixel * 4 + 3] > 0) {
      filled[pixel] = 1;
    }
  }
  // Seed only chart-edge pixels; interior pixels cannot contribute a bleed.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (filled[pixel] === 0) {
        continue;
      }
      let boundary = false;
      for (let oy = -1; oy <= 1 && !boundary; oy += 1) {
        const ny = y + oy;
        if (ny < 0 || ny >= height) {
          continue;
        }
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          if (nx < 0 || nx >= width || (ox === 0 && oy === 0)) {
            continue;
          }
          if (filled[ny * width + nx] === 0) {
            boundary = true;
            break;
          }
        }
      }
      if (boundary) {
        queue[tail] = pixel;
        tail += 1;
      }
    }
  }
  while (head < tail) {
    const donor = queue[head];
    head += 1;
    const donorDepth = depth[donor];
    if (donorDepth >= maxPass) {
      continue;
    }
    const x = donor % width;
    const y = Math.floor(donor / width);
    for (let oy = -1; oy <= 1; oy += 1) {
      const ny = y + oy;
      if (ny < 0 || ny >= height) {
        continue;
      }
      for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox;
        if (nx < 0 || nx >= width || (ox === 0 && oy === 0)) {
          continue;
        }
        const target = ny * width + nx;
        if (filled[target] !== 0) {
          continue;
        }
        const sourceOffset = donor * 4;
        const targetOffset = target * 4;
        data[targetOffset] = data[sourceOffset];
        data[targetOffset + 1] = data[sourceOffset + 1];
        data[targetOffset + 2] = data[sourceOffset + 2];
        data[targetOffset + 3] = data[sourceOffset + 3];
        filled[target] = 1;
        depth[target] = donorDepth + 1;
        queue[tail] = target;
        tail += 1;
      }
    }
  }
}
