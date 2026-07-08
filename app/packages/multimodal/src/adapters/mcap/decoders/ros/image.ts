import type { DecodedAttributeValue } from "../../../../decoders";
import { resourceHintsForArrayBufferViews } from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  bytesField,
  integerField,
  numberField,
  optionalBoolean,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_IMAGE_PAYLOADS } from "./payloads";

const RGBA_CHANNEL_COUNT = 4;
const UINT8_MAX = 255;
const UINT16_MAX = 65_535;

type BayerPattern = "bggr" | "gbrg" | "grbg" | "rggb";
type BayerColor = "b" | "g" | "r";

interface ImageLayout {
  readonly data: Uint8Array;
  readonly height: number;
  readonly step: number;
  readonly width: number;
}

interface DecodeImageResult {
  readonly attributes?: Record<string, DecodedAttributeValue>;
  readonly rgba?: Uint8Array;
  readonly unsupportedReason?: string;
}

/**
 * Decoders for ROS Image messages.
 */
export const rosImageDecoders = rosDecodersForPayloads({
  id: "ros.image",
  map(message, context) {
    const header = rosHeader(message);
    const frameId = rosHeaderFrameId(header);
    const messageTimestamp = rosHeaderTimestampNs(header);
    const width = integerField(message, "width");
    const height = integerField(message, "height");
    const step = integerField(message, "step");
    const encoding = stringField(message, "encoding", "unknown");
    const data = bytesField(message, "data");
    const bigEndian = booleanLikeField(message, "is_bigendian");
    const baseAttributes: Record<string, DecodedAttributeValue> = {
      ...rosHeaderAttributes(header),
      bigEndian,
      byteLength: data.byteLength,
      encoding,
      height,
      step,
      width,
    };
    const timing = timingFromRosHeader(context, header);
    const result = decodeImageRgba({
      bigEndian,
      data,
      encoding,
      height,
      step,
      width,
    });
    const attributes = {
      ...baseAttributes,
      ...result.attributes,
      ...(result.unsupportedReason
        ? { unsupportedReason: result.unsupportedReason }
        : {}),
    };

    if (!result.rgba) {
      return {
        attributes,
        timing,
      };
    }

    return {
      attributes,
      resourceHints: resourceHintsForArrayBufferViews(result.rgba),
      timing,
      visualization: {
        ...(frameId ? { coordinateFrameId: frameId } : {}),
        height,
        kind: VISUALIZATION_KIND.RAW_IMAGE,
        rgba: result.rgba,
        sourceEncoding: encoding,
        ...(messageTimestamp !== undefined
          ? { timestampNs: messageTimestamp }
          : {}),
        width,
      },
    };
  },
  payloads: ROS_IMAGE_PAYLOADS,
});

function decodeImageRgba({
  bigEndian,
  data,
  encoding,
  height,
  step,
  width,
}: ImageLayout & {
  readonly bigEndian: boolean;
  readonly encoding: string;
}): DecodeImageResult {
  const normalizedEncoding = encoding.trim().toLowerCase();
  const bayerMatch = /^bayer_(rggb|bggr|gbrg|grbg)(8|16)$/.exec(
    normalizedEncoding,
  );
  const bytesPerPixel = bytesPerPixelForEncoding(
    normalizedEncoding,
    bayerMatch,
  );
  if (!bytesPerPixel) {
    return {
      unsupportedReason: `ROS Image encoding '${encoding}' is unsupported`,
    };
  }

  const invalidLayoutReason = validateLayout({
    bytesPerPixel,
    data,
    height,
    step,
    width,
  });
  if (invalidLayoutReason) {
    return { unsupportedReason: invalidLayoutReason };
  }

  const littleEndian = !bigEndian;
  switch (normalizedEncoding) {
    case "rgb8":
    case "8uc3":
      return { rgba: colorRgba({ data, height, order: "rgb", step, width }) };
    case "bgr8":
      return { rgba: colorRgba({ data, height, order: "bgr", step, width }) };
    case "rgba8":
    case "8uc4":
      return { rgba: colorRgba({ data, height, order: "rgba", step, width }) };
    case "bgra8":
      return { rgba: colorRgba({ data, height, order: "bgra", step, width }) };
    case "mono8":
    case "8uc1":
      return { rgba: mono8Rgba({ data, height, step, width }) };
    case "mono16":
      return mono16Rgba({ data, height, littleEndian, step, width });
    case "16uc1":
      return depth16Rgba({ data, height, littleEndian, step, width });
    case "32fc1":
      return depth32Rgba({ data, height, littleEndian, step, width });
    default:
      if (!bayerMatch) {
        return {
          unsupportedReason: `ROS Image encoding '${encoding}' is unsupported`,
        };
      }
      return {
        rgba: bayerRgba({
          bitsPerPixel: bayerMatch[2] === "16" ? 16 : 8,
          data,
          height,
          littleEndian,
          pattern: bayerMatch[1] as BayerPattern,
          step,
          width,
        }),
      };
  }
}

function bytesPerPixelForEncoding(
  encoding: string,
  bayerMatch: RegExpExecArray | null,
): number | null {
  if (bayerMatch) {
    return bayerMatch[2] === "16" ? 2 : 1;
  }

  switch (encoding) {
    case "rgb8":
    case "bgr8":
    case "8uc3":
      return 3;
    case "rgba8":
    case "bgra8":
    case "8uc4":
      return 4;
    case "mono8":
    case "8uc1":
      return 1;
    case "mono16":
    case "16uc1":
      return 2;
    case "32fc1":
      return 4;
    default:
      return null;
  }
}

function validateLayout({
  bytesPerPixel,
  data,
  height,
  step,
  width,
}: ImageLayout & {
  readonly bytesPerPixel: number;
}): string | null {
  if (!isPositiveSafeInteger(width) || !isPositiveSafeInteger(height)) {
    return `Invalid Image dimensions ${width}x${height}`;
  }
  if (!isPositiveSafeInteger(step)) {
    return `Invalid Image step ${step}`;
  }

  const minimumRowBytes = safeProduct(width, bytesPerPixel);
  if (minimumRowBytes === null) {
    return `Invalid Image dimensions ${width}x${height}`;
  }
  if (step < minimumRowBytes) {
    return `Image step ${step} cannot hold ${width} pixels of ${bytesPerPixel} bytes`;
  }

  const expectedByteLength = safeProduct(step, height);
  if (expectedByteLength === null) {
    return `Invalid Image byte length for ${width}x${height}`;
  }
  if (data.byteLength < expectedByteLength) {
    return `Image has ${data.byteLength} bytes, expected at least ${expectedByteLength}`;
  }

  const rgbaBytes = safeProduct(width, height, RGBA_CHANNEL_COUNT);
  if (rgbaBytes === null) {
    return `Invalid Image dimensions ${width}x${height}`;
  }

  return null;
}

function colorRgba({
  data,
  height,
  order,
  step,
  width,
}: ImageLayout & {
  readonly order: "bgr" | "bgra" | "rgb" | "rgba";
}): Uint8Array {
  const hasAlpha = order.length === 4;
  const sourcePixelBytes = hasAlpha ? 4 : 3;
  const rgba = new Uint8Array(width * height * RGBA_CHANNEL_COUNT);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * step;
    for (let x = 0; x < width; x++) {
      const sourceOffset = rowOffset + x * sourcePixelBytes;
      const targetOffset = (y * width + x) * RGBA_CHANNEL_COUNT;
      const first = data[sourceOffset] ?? 0;
      const second = data[sourceOffset + 1] ?? 0;
      const third = data[sourceOffset + 2] ?? 0;
      if (order.startsWith("b")) {
        rgba[targetOffset] = third;
        rgba[targetOffset + 1] = second;
        rgba[targetOffset + 2] = first;
      } else {
        rgba[targetOffset] = first;
        rgba[targetOffset + 1] = second;
        rgba[targetOffset + 2] = third;
      }
      rgba[targetOffset + 3] = hasAlpha
        ? (data[sourceOffset + 3] ?? UINT8_MAX)
        : UINT8_MAX;
    }
  }
  return rgba;
}

function mono8Rgba({ data, height, step, width }: ImageLayout): Uint8Array {
  const rgba = new Uint8Array(width * height * RGBA_CHANNEL_COUNT);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * step;
    for (let x = 0; x < width; x++) {
      writeGray(rgba, y * width + x, data[rowOffset + x] ?? 0, UINT8_MAX);
    }
  }
  return rgba;
}

function mono16Rgba({
  data,
  height,
  littleEndian,
  step,
  width,
}: ImageLayout & {
  readonly littleEndian: boolean;
}): DecodeImageResult {
  const pixelCount = width * height;
  const values = new Uint16Array(pixelCount);
  const view = dataView(data);
  let min = UINT16_MAX;
  let max = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * step;
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const value = view.getUint16(rowOffset + x * 2, littleEndian);
      values[pixelIndex] = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  const rgba = new Uint8Array(pixelCount * RGBA_CHANNEL_COUNT);
  for (let index = 0; index < pixelCount; index++) {
    const value = values[index] ?? 0;
    const shade =
      min === max
        ? uint16ToUint8(value)
        : ((value - min) / (max - min)) * UINT8_MAX;
    writeGray(rgba, index, clampUint8(shade), UINT8_MAX);
  }

  return { rgba };
}

function depth16Rgba({
  data,
  height,
  littleEndian,
  step,
  width,
}: ImageLayout & {
  readonly littleEndian: boolean;
}): DecodeImageResult {
  const view = dataView(data);
  return depthRgba({
    height,
    readValue: (pixelIndex) => {
      const y = Math.floor(pixelIndex / width);
      const x = pixelIndex % width;
      return view.getUint16(y * step + x * 2, littleEndian);
    },
    width,
  });
}

function depth32Rgba({
  data,
  height,
  littleEndian,
  step,
  width,
}: ImageLayout & {
  readonly littleEndian: boolean;
}): DecodeImageResult {
  const view = dataView(data);
  return depthRgba({
    height,
    readValue: (pixelIndex) => {
      const y = Math.floor(pixelIndex / width);
      const x = pixelIndex % width;
      return view.getFloat32(y * step + x * 4, littleEndian);
    },
    width,
  });
}

function depthRgba({
  height,
  readValue,
  width,
}: {
  readonly height: number;
  readonly readValue: (pixelIndex: number) => number;
  readonly width: number;
}): DecodeImageResult {
  const pixelCount = width * height;
  const values = new Float32Array(pixelCount);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < pixelCount; index++) {
    const value = readValue(index);
    values[index] = value;
    if (value > 0 && Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  const rgba = new Uint8Array(pixelCount * RGBA_CHANNEL_COUNT);
  const hasRange = Number.isFinite(min) && Number.isFinite(max);
  for (let index = 0; index < pixelCount; index++) {
    const value = values[index] ?? Number.NaN;
    if (!(value > 0) || !Number.isFinite(value) || !hasRange) {
      writeGray(rgba, index, 0, 0);
      continue;
    }

    const shade =
      min === max ? UINT8_MAX : ((value - min) / (max - min)) * UINT8_MAX;
    writeGray(rgba, index, clampUint8(shade), UINT8_MAX);
  }

  return {
    attributes: hasRange
      ? {
          depthMax: max,
          depthMin: min,
        }
      : undefined,
    rgba,
  };
}

function bayerRgba({
  bitsPerPixel,
  data,
  height,
  littleEndian,
  pattern,
  step,
  width,
}: ImageLayout & {
  readonly bitsPerPixel: 8 | 16;
  readonly littleEndian: boolean;
  readonly pattern: BayerPattern;
}): Uint8Array {
  const rgba = new Uint8Array(width * height * RGBA_CHANNEL_COUNT);
  const view = bitsPerPixel === 16 ? dataView(data) : null;
  const source = (x: number, y: number) =>
    bayerValue(data, view, step, x, y, bitsPerPixel, littleEndian);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerColor = bayerColor(pattern, x, y);
      const centerValue = source(x, y);
      const red =
        centerColor === "r"
          ? centerValue
          : averageBayerColor({
              height,
              pattern,
              source,
              target: "r",
              width,
              x,
              y,
            });
      const green =
        centerColor === "g"
          ? centerValue
          : averageBayerColor({
              height,
              pattern,
              source,
              target: "g",
              width,
              x,
              y,
            });
      const blue =
        centerColor === "b"
          ? centerValue
          : averageBayerColor({
              height,
              pattern,
              source,
              target: "b",
              width,
              x,
              y,
            });
      const offset = (y * width + x) * RGBA_CHANNEL_COUNT;
      rgba[offset] = red;
      rgba[offset + 1] = green;
      rgba[offset + 2] = blue;
      rgba[offset + 3] = UINT8_MAX;
    }
  }

  return rgba;
}

function averageBayerColor({
  height,
  pattern,
  source,
  target,
  width,
  x,
  y,
}: {
  readonly height: number;
  readonly pattern: BayerPattern;
  readonly source: (x: number, y: number) => number;
  readonly target: BayerColor;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}): number {
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const sampleY = y + dy;
    if (sampleY < 0 || sampleY >= height) {
      continue;
    }
    for (let dx = -1; dx <= 1; dx++) {
      const sampleX = x + dx;
      if (sampleX < 0 || sampleX >= width) {
        continue;
      }
      if (bayerColor(pattern, sampleX, sampleY) !== target) {
        continue;
      }
      sum += source(sampleX, sampleY);
      count += 1;
    }
  }

  return count > 0 ? clampUint8(sum / count) : source(x, y);
}

function bayerValue(
  data: Uint8Array,
  view: DataView | null,
  step: number,
  x: number,
  y: number,
  bitsPerPixel: 8 | 16,
  littleEndian: boolean,
): number {
  const offset = y * step + x * (bitsPerPixel === 16 ? 2 : 1);
  if (bitsPerPixel === 8) {
    return data[offset] ?? 0;
  }
  return uint16ToUint8(view?.getUint16(offset, littleEndian) ?? 0);
}

function bayerColor(pattern: BayerPattern, x: number, y: number): BayerColor {
  const evenX = x % 2 === 0;
  const evenY = y % 2 === 0;
  switch (pattern) {
    case "rggb":
      return evenY ? (evenX ? "r" : "g") : evenX ? "g" : "b";
    case "bggr":
      return evenY ? (evenX ? "b" : "g") : evenX ? "g" : "r";
    case "gbrg":
      return evenY ? (evenX ? "g" : "b") : evenX ? "r" : "g";
    case "grbg":
      return evenY ? (evenX ? "g" : "r") : evenX ? "b" : "g";
  }
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

function booleanLikeField(
  record: Record<string, unknown>,
  field: string,
): boolean {
  const booleanValue = optionalBoolean(record, field);
  if (booleanValue !== undefined) {
    return booleanValue;
  }

  return numberField(record, field, undefined, 0) !== 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function safeProduct(...values: readonly number[]): number | null {
  let product = 1;
  for (const value of values) {
    product *= value;
    if (!Number.isSafeInteger(product)) {
      return null;
    }
  }
  return product;
}

function dataView(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function uint16ToUint8(value: number): number {
  return Math.round((value / UINT16_MAX) * UINT8_MAX);
}

function clampUint8(value: number): number {
  return Math.max(0, Math.min(UINT8_MAX, Math.round(value)));
}
