import type { RawImageVisualization } from "../../ir";

const RGBA_CHANNEL_COUNT = 4;
const UINT8_MAX = 255;
const materializedDepthRgba = new WeakMap<RawImageVisualization, Uint8Array>();

/**
 * Returns display-ready RGBA for a raw image.
 *
 * Native depth frames deliberately omit their eager RGBA backing store. This
 * helper is the bitmap fallback and preserves the decoder's exact invalid-
 * value transparency, per-frame range, and byte quantization rules.
 */
export function rawImageRgba(frame: RawImageVisualization): Uint8Array {
  const expectedByteLength = frame.width * frame.height * RGBA_CHANNEL_COUNT;
  if (frame.rgba.byteLength >= expectedByteLength) {
    return frame.rgba.subarray(0, expectedByteLength);
  }

  const depth = frame.depth;
  if (!depth || depth.values.length !== frame.width * frame.height) {
    throw new Error("Raw image frame has too few RGBA bytes");
  }

  const cached = materializedDepthRgba.get(frame);
  if (cached) {
    return cached;
  }

  const rgba = new Uint8Array(expectedByteLength);
  const { maxValue, minValue, values } = depth;
  const hasRange = minValue !== null && maxValue !== null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? Number.NaN;
    if (!(value > 0) || !Number.isFinite(value) || !hasRange) {
      writeGray(rgba, index, 0, 0);
      continue;
    }

    const shade =
      minValue === maxValue
        ? UINT8_MAX
        : ((value - minValue) / (maxValue - minValue)) * UINT8_MAX;
    writeGray(rgba, index, clampUint8(shade), UINT8_MAX);
  }
  materializedDepthRgba.set(frame, rgba);
  return rgba;
}

function writeGray(
  rgba: Uint8Array,
  pixelIndex: number,
  gray: number,
  alpha: number,
): void {
  const offset = pixelIndex * RGBA_CHANNEL_COUNT;
  rgba[offset] = gray;
  rgba[offset + 1] = gray;
  rgba[offset + 2] = gray;
  rgba[offset + 3] = alpha;
}

function clampUint8(value: number): number {
  return Math.max(0, Math.min(UINT8_MAX, Math.round(value)));
}
