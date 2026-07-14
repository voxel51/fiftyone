/**
 * Converts a `bigint` byte length to a `number`, throwing if the value
 * exceeds `Number.MAX_SAFE_INTEGER`. MCAP byte offsets and lengths are
 * encoded as `uint64`; values beyond the safe integer range would silently
 * corrupt arithmetic.
 */
export function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Byte length ${value.toString()} exceeds safe number range`,
    );
  }

  return Number(value);
}
