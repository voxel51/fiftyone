/** Comparator for bigint values suitable for array sorting. */
export function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
