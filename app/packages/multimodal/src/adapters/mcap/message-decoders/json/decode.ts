/**
 * Shared helpers for JSON-encoded MCAP message decoding. JSON channels
 * carry UTF-8 message bytes described by a `jsonschema` schema; unlike
 * protobuf, the schema bytes are not needed to parse a message, so these
 * helpers only turn bytes into validated plain records.
 */

const utf8Decoder = new TextDecoder();

/**
 * Parses JSON message bytes into a plain object record. Throws when the
 * bytes are not valid UTF-8 JSON or the top-level value is not an object.
 */
export function decodeJsonRecord(bytes: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(utf8Decoder.decode(bytes));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON message is not an object");
  }

  return value as Record<string, unknown>;
}

/**
 * Reads a nested object field, accepting alias field names in order.
 */
export function recordField(
  record: Record<string, unknown>,
  ...fields: readonly string[]
): Record<string, unknown> | undefined {
  for (const field of fields) {
    const value = record[field];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return undefined;
}

/**
 * Reads a finite numeric field, or undefined when absent/non-numeric.
 */
export function finiteNumberField(
  record: Record<string, unknown> | undefined,
  field: string,
): number | undefined {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
