import type {
  PointCloudChannelArray,
  PointCloudChannelEncoding,
  PointCloudChannelStorage,
} from "../ir/frames";

/** Canonical byte RGB interpretation shared by decoders and GPU readers. */
export const POINT_CLOUD_RGB_ENCODING = Object.freeze({
  componentCount: 3,
  invalidValue: null,
  origin: 0,
  scale: 1 / 255,
  storage: "uint8",
} as const satisfies PointCloudChannelEncoding);

/** Lossless scalar interpretation for values already stored as Float32. */
export const POINT_CLOUD_FLOAT32_SCALAR_ENCODING = Object.freeze({
  componentCount: 1,
  invalidValue: null,
  origin: 0,
  scale: 1,
  storage: "float32",
} as const satisfies PointCloudChannelEncoding);

/** Creates a capacity-sized array matching a channel's declared storage. */
export function createPointCloudChannelArray(
  encoding: PointCloudChannelEncoding,
  length: number,
): PointCloudChannelArray {
  const normalizedLength = Math.max(0, Math.floor(length));
  switch (encoding.storage) {
    case "float32":
      return new Float32Array(normalizedLength);
    case "int8":
      return new Int8Array(normalizedLength);
    case "uint8":
      return new Uint8Array(normalizedLength);
    case "int16":
      return new Int16Array(normalizedLength);
    case "uint16":
      return new Uint16Array(normalizedLength);
    case "int32":
      return new Int32Array(normalizedLength);
    case "uint32":
      return new Uint32Array(normalizedLength);
  }
}

/** Decodes one stored component according to its channel descriptor. */
export function decodePointCloudChannelValue(
  encoding: PointCloudChannelEncoding,
  storedValue: number | undefined,
): number {
  if (
    storedValue === undefined ||
    (encoding.invalidValue !== null && storedValue === encoding.invalidValue)
  ) {
    return Number.NaN;
  }
  return encoding.origin + storedValue * encoding.scale;
}

/** Stable shader/resource topology key for one channel interpretation. */
export function pointCloudChannelEncodingKey(
  encoding: PointCloudChannelEncoding,
): string {
  return [
    encoding.storage,
    encoding.componentCount,
    numberKey(encoding.origin),
    numberKey(encoding.scale),
    encoding.invalidValue === null
      ? "valid-all"
      : `invalid-${numberKey(encoding.invalidValue)}`,
  ].join(":");
}

/** Returns the native storage descriptor for a supported integer field. */
export function pointCloudNativeIntegerScalarEncoding(
  storage: Exclude<PointCloudChannelStorage, "float32">,
): PointCloudChannelEncoding & { readonly componentCount: 1 } {
  return {
    componentCount: 1,
    invalidValue: null,
    origin: 0,
    scale: 1,
    storage,
  };
}

function numberKey(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}
