import type {
  DecodeContext,
  DecodedAttributeValue,
  PayloadDescriptor,
} from "../../../../decoders";
import { optionalBigInt, optionalString } from "../foxglove/protobuf/records";
import { timingFromContext } from "../foxglove/protobuf/timing";
import { rosRecordDecoderForPayload } from "./wire";

const NANOSECONDS_PER_SECOND = 1_000_000_000n;

/**
 * Decodes one ROS payload into a generic record using schema data from the
 * decoder context.
 */
export function decodeRosMessage(
  bytes: Uint8Array,
  payload: PayloadDescriptor,
  context: DecodeContext,
): Record<string, unknown> {
  const schemaData = schemaDataFromContext(context);
  if (!schemaData || schemaData.byteLength === 0) {
    throw new Error(
      `Schema data is required to decode ${payload.schema ?? "ROS message"}`,
    );
  }

  const decode = rosRecordDecoderForPayload(payload, schemaData);
  if (!decode) {
    throw new Error(
      `Unable to parse ROS schema for ${payload.schema ?? "ROS message"}`,
    );
  }

  return decode(bytes);
}

/**
 * Returns schema bytes from a decoder context when present.
 */
export function schemaDataFromContext(
  context: DecodeContext,
): Uint8Array | undefined {
  const schemaData = context.schemaData;
  if (schemaData === undefined || schemaData === null) {
    return undefined;
  }

  if (!(schemaData instanceof Uint8Array)) {
    throw new Error("Decoder context schemaData is not bytes");
  }

  return schemaData;
}

/**
 * Reads an optional nested record field, with a fallback field name for
 * ROS/Foxglove casing differences.
 */
export function recordField(
  record: Record<string, unknown> | undefined,
  field: string,
  fallbackField?: string,
): Record<string, unknown> | undefined {
  const value =
    record?.[field] ?? (fallbackField ? record?.[fallbackField] : undefined);
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Field '${field}' is not an object`);
  }

  return value as Record<string, unknown>;
}

/**
 * Reads an array field, returning an empty array when the field is absent.
 */
export function arrayField(
  record: Record<string, unknown>,
  field: string,
): readonly unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}

/**
 * Reads a byte array field from common ROS decoder output shapes.
 */
export function bytesField(
  record: Record<string, unknown>,
  field: string,
): Uint8Array {
  const value = record[field];
  if (value instanceof Uint8Array) {
    return value;
  }
  if (isArrayBufferView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((entry) => numberValue(entry) ?? 0));
  }

  throw new Error(`Field '${field}' is not bytes`);
}

/**
 * Reads a signed int8 array field from common ROS decoder output shapes.
 */
export function int8ArrayField(
  record: Record<string, unknown>,
  field: string,
): Int8Array {
  const value = record[field];
  if (value instanceof Int8Array) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return new Int8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (isArrayBufferView(value)) {
    return Int8Array.from(arrayBufferViewNumbers(value));
  }
  if (Array.isArray(value)) {
    return Int8Array.from(value.map((entry) => numberValue(entry) ?? 0));
  }

  throw new Error(`Field '${field}' is not an int8 array`);
}

/**
 * Reads a numeric array field and preserves invalid entries as NaN.
 */
export function numberArrayField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): readonly number[] {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  const values = isArrayBufferView(value)
    ? arrayBufferViewNumbers(value)
    : Array.isArray(value)
      ? value
      : [];

  return values.map((entry) => numberValue(entry) ?? Number.NaN);
}

/**
 * Reads a numeric array field and drops non-finite entries.
 */
export function finiteNumberArrayField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): readonly number[] {
  return numberArrayField(record, field, fallbackField).filter((entry) =>
    Number.isFinite(entry),
  );
}

/**
 * Reads a number-like field, including bigint values, with a default fallback.
 */
export function numberField(
  record: Record<string, unknown> | undefined,
  field: string,
  fallbackField?: string,
  defaultValue = 0,
): number {
  const value =
    record?.[field] ?? (fallbackField ? record?.[fallbackField] : undefined);
  return numberValue(value) ?? defaultValue;
}

/**
 * Reads a finite numeric field or throws when it is missing/invalid.
 */
export function requiredFiniteNumber(
  record: Record<string, unknown> | undefined,
  field: string,
  fallbackField?: string,
): number {
  const value = numberField(record, field, fallbackField, Number.NaN);
  if (!Number.isFinite(value)) {
    throw new Error(`Field '${field}' is not a finite number`);
  }

  return value;
}

/**
 * Reads an optional boolean field.
 */
export function optionalBoolean(
  record: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = record[field];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Reads the conventional ROS message header field.
 */
export function rosHeader(
  record: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return recordField(record, "header");
}

/**
 * Extracts a ROS header frame id across ROS 1/2 decoder casing variants.
 */
export function rosHeaderFrameId(
  header: Record<string, unknown> | undefined,
): string | undefined {
  return header ? optionalString(header, "frame_id", "frameId") : undefined;
}

/**
 * Converts a ROS header stamp to nanoseconds.
 */
export function rosHeaderTimestampNs(
  header: Record<string, unknown> | undefined,
): bigint | undefined {
  return rosTimestampNs(recordField(header, "stamp"));
}

/**
 * Converts ROS timestamp records to nanoseconds.
 */
export function rosTimestampNs(
  timestamp: Record<string, unknown> | undefined,
): bigint | undefined {
  if (!timestamp) {
    return undefined;
  }

  const seconds = firstBigInt(timestamp, ["sec", "seconds"]);
  const nanos = firstBigInt(timestamp, ["nsec", "nanosec", "nanos"]);
  if (seconds === undefined && nanos === undefined) {
    return undefined;
  }

  return (seconds ?? 0n) * NANOSECONDS_PER_SECOND + (nanos ?? 0n);
}

/**
 * Builds decoder timing metadata from a ROS message header.
 */
export function timingFromRosHeader(
  context: DecodeContext,
  header: Record<string, unknown> | undefined,
) {
  return timingFromContext(context, rosHeaderTimestampNs(header));
}

/**
 * Converts common ROS header fields into raw-message attributes.
 */
export function rosHeaderAttributes(
  header: Record<string, unknown> | undefined,
): Record<string, DecodedAttributeValue> {
  const attributes: Record<string, DecodedAttributeValue> = {};
  const frameId = rosHeaderFrameId(header);
  if (frameId) {
    attributes.frameId = frameId;
  }

  const sequence = header ? header["seq"] : undefined;
  if (typeof sequence === "number" || typeof sequence === "bigint") {
    attributes.sequence = sequence;
  }

  return attributes;
}

/**
 * Reads a string field with a fallback value.
 */
export function stringField(
  record: Record<string, unknown>,
  field: string,
  fallback = "",
): string {
  const value = record[field];
  return typeof value === "string" ? value : fallback;
}

function firstBigInt(
  record: Record<string, unknown>,
  fields: readonly string[],
): bigint | undefined {
  for (const field of fields) {
    const value = optionalBigInt(record, field);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber();
  }

  return undefined;
}

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

function arrayBufferViewNumbers(value: ArrayBufferView): readonly number[] {
  if (value instanceof DataView) {
    return Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }

  return Array.from(value as unknown as ArrayLike<number>, Number);
}
