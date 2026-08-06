const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

/** Returns the eight-digit FNV-1a hash of a byte sequence. */
export function fnv1aBytesHex(data: Uint8Array): string {
  let hash = FNV1A_OFFSET_BASIS;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Returns a seeded FNV-1a hash over JavaScript UTF-16 code units. */
export function fnv1aString(value: string, seed = FNV1A_OFFSET_BASIS): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  return hash >>> 0;
}

/**
 * Returns a namespaced 64-bit-style fingerprint built from two FNV-1a runs.
 *
 * Source identities use a per-session salt because they may be published to
 * diagnostics. Record identities intentionally omit it: the worker and main
 * thread mint the same value independently and use that stable equality only
 * to correlate ownership events. Those identities remain inside the cost
 * instrumentation path and are never published as source identifiers.
 */
export function fnv1aFingerprint(
  kind: string,
  value: string,
  salt = 0,
): string {
  const left = fnv1aString(value, salt ^ FNV1A_OFFSET_BASIS);
  const right = fnv1aString(value, salt ^ 0x9e3779b9);
  return `${kind}-${hex32(left)}${hex32(right)}`;
}

function hex32(value: number): string {
  return value.toString(16).padStart(8, "0");
}
