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

/**
 * Decodes a base64 string into bytes. JSON-encoded Foxglove messages carry
 * binary payloads (`data`) this way, per their schema's
 * `contentEncoding: "base64"`.
 */
export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Nanoseconds per second — the upper bound for a Foxglove `Time.nsec`. */
const NS_PER_SEC = 1_000_000_000;

/**
 * Converts a Foxglove JSON `{sec, nsec}` record to nanoseconds, or
 * `undefined` when absent or out of range.
 *
 * Foxglove `Time` requires `0 <= nsec < 1e9` and a non-negative `sec`. A
 * message outside that range would otherwise yield a timestamp for a
 * different instant, silently shifting audio alignment — better to report
 * no timestamp than a wrong one.
 */
export function jsonTimestampNs(
  timestamp: Record<string, unknown> | undefined,
): bigint | undefined {
  const sec = finiteNumberField(timestamp, "sec");
  if (sec === undefined || sec < 0) return undefined;
  const nsec = finiteNumberField(timestamp, "nsec") ?? 0;
  if (nsec < 0 || nsec >= NS_PER_SEC) return undefined;
  return (
    BigInt(Math.trunc(sec)) * BigInt(NS_PER_SEC) + BigInt(Math.trunc(nsec))
  );
}

/**
 * The decode preamble every JSON Foxglove media message shares: parse the
 * record, require a base64 `data` string, and read the timestamp.
 *
 * Returns a `reason` instead of throwing so callers can degrade to
 * attributes-only output — the synchronized-batch read path has no
 * per-message error isolation, and one throwing decoder would reject whole
 * playback windows for every topic in them.
 */
export function decodeJsonMediaMessage(
  bytes: Uint8Array,
  kind: string,
):
  | {
      ok: true;
      message: Record<string, unknown>;
      data: Uint8Array;
      timestampNs?: bigint;
    }
  | { ok: false; reason: string } {
  let message: Record<string, unknown>;
  try {
    message = decodeJsonRecord(bytes);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Invalid JSON message",
    };
  }

  if (typeof message.data !== "string") {
    return { ok: false, reason: `JSON ${kind} message has no base64 data` };
  }

  let data: Uint8Array;
  try {
    data = base64ToBytes(message.data);
  } catch {
    return { ok: false, reason: `JSON ${kind} data is not valid base64` };
  }

  return {
    ok: true,
    message,
    data,
    timestampNs: jsonTimestampNs(recordField(message, "timestamp")),
  };
}
