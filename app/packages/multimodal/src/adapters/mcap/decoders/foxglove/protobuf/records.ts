/**
 * Small runtime coercion helpers for decoded Foxglove protobuf messages.
 *
 * Protobufjs returns plain JavaScript objects whose exact field casing depends
 * on descriptor/runtime behavior, so Foxglove decoders use these helpers to
 * turn unknown values into the concrete shapes needed by visualization
 * extraction.
 */

/**
 * Treat a decoded protobuf value as a plain record, or fail when the decoded
 * value is not object-like.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new Error("Decoded protobuf message is not an object");
  }

  return value as Record<string, unknown>;
}

/**
 * Read an optional nested record field from a decoded protobuf message.
 */
export function optionalRecord(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): Record<string, unknown> | undefined {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (value === undefined || value === null) {
    return undefined;
  }

  return asRecord(value);
}

/**
 * Read a required repeated protobuf field as an array.
 */
export function requiredArray(
  record: Record<string, unknown>,
  field: string,
): readonly unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`Field '${field}' is not an array`);
  }

  return value;
}

/**
 * Read a required bytes field as a Uint8Array.
 */
export function requiredBytes(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (!(value instanceof Uint8Array)) {
    throw new Error(`Field '${field}' is not bytes`);
  }

  return value;
}

/**
 * Read a required numeric field, optionally accepting a fallback field name for
 * protobuf runtimes that expose snake_case instead of camelCase.
 */
export function requiredNumber(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
) {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value !== "number") {
    throw new Error(`Field '${field}' is not a number`);
  }

  return value;
}

/**
 * Read a required string field.
 */
export function requiredString(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`Field '${field}' is not a string`);
  }

  return value;
}

/**
 * Read an optional non-empty string field, optionally accepting a fallback field
 * name for protobuf runtimes that expose snake_case instead of camelCase.
 */
export function optionalString(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
) {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value === "string" && value) {
    return value;
  }

  return undefined;
}

/**
 * Read an optional protobuf integer-like field as bigint. Protobufjs may expose
 * timestamp components as bigint, number, string, or Long-like objects. Invalid
 * values are treated as absent.
 */
export function optionalBigInt(
  record: Record<string, unknown>,
  field: string,
): bigint | undefined {
  const value = record[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return parseBigInt(value);
  }
  if (typeof value === "string") {
    return parseBigInt(value);
  }
  if (
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return parseBigInt(value.toString());
  }

  return undefined;
}

function parseBigInt(value: number | string): bigint | undefined {
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}
