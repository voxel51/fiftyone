/**
 * Parses decimal byte-size strings that may represent uint64-sized values.
 */
export function parseByteSize(value: string | null | undefined) {
  if (value === undefined || value === null || !/^\d+$/.test(value)) {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}
