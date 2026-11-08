/** Compact, lossless representation of one baked lighting image. */
export interface CompactLightingBuffer {
  readonly width: number;
  readonly height: number;
  /** 1 = monochrome, 3 = RGB, 4 = RGBA. */
  readonly channels: 1 | 3 | 4;
  readonly bytes: Uint8Array;
}

/**
 * Pack an opaque baked lighting image without retaining the RGBA ImageData.
 *
 * Baked lighting is normally opaque and often monochrome because the default
 * lights are white. Detect both cases, but fall back to RGBA whenever the
 * source has meaningful alpha so undo/redo stays lossless.
 */
export function packLightingImageData(
  image: ImageData
): CompactLightingBuffer {
  const count = image.width * image.height;
  const data = image.data;
  let opaque = true;
  let monochrome = true;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] !== 255) {
      opaque = false;
    }
    if (
      data[offset] !== data[offset + 1] ||
      data[offset] !== data[offset + 2]
    ) {
      monochrome = false;
    }
    if (!opaque && !monochrome) {
      break;
    }
  }
  if (!opaque) {
    return {
      width: image.width,
      height: image.height,
      channels: 4,
      bytes: new Uint8Array(data)
    };
  }
  if (monochrome) {
    const bytes = new Uint8Array(count);
    for (let pixel = 0; pixel < count; pixel += 1) {
      bytes[pixel] = data[pixel * 4];
    }
    return {
      width: image.width,
      height: image.height,
      channels: 1,
      bytes
    };
  }
  const bytes = new Uint8Array(count * 3);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const source = pixel * 4;
    const target = pixel * 3;
    bytes[target] = data[source];
    bytes[target + 1] = data[source + 1];
    bytes[target + 2] = data[source + 2];
  }
  return {
    width: image.width,
    height: image.height,
    channels: 3,
    bytes
  };
}

/** Expand a compact lighting snapshot back to RGBA pixels. */
export function unpackLightingPixels(
  buffer: CompactLightingBuffer
): Uint8ClampedArray {
  const count = buffer.width * buffer.height;
  const data = new Uint8ClampedArray(count * 4);
  if (buffer.channels === 1) {
    if (buffer.bytes.length < count) {
      throw new Error('The compact lighting buffer is truncated.');
    }
    for (let pixel = 0; pixel < count; pixel += 1) {
      const value = buffer.bytes[pixel];
      const target = pixel * 4;
      data[target] = value;
      data[target + 1] = value;
      data[target + 2] = value;
      data[target + 3] = 255;
    }
    return data;
  }
  const stride = buffer.channels;
  if (buffer.bytes.length < count * stride) {
    throw new Error('The compact lighting buffer is truncated.');
  }
  for (let pixel = 0; pixel < count; pixel += 1) {
    const source = pixel * stride;
    const target = pixel * 4;
    data[target] = buffer.bytes[source];
    data[target + 1] = buffer.bytes[source + 1];
    data[target + 2] = buffer.bytes[source + 2];
    data[target + 3] = stride === 4 ? buffer.bytes[source + 3] : 255;
  }
  return data;
}

/** Rebuild an ImageData for the synchronous bake command. */
export function unpackLightingImageData(
  buffer: CompactLightingBuffer
): ImageData {
  const pixels = unpackLightingPixels(buffer);
  return new ImageData(
    new Uint8ClampedArray(
      pixels.buffer as ArrayBuffer,
      pixels.byteOffset,
      pixels.length
    ),
    buffer.width,
    buffer.height
  );
}
