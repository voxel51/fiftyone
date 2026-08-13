const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_SECOND_NUMBER = 1_000_000_000;

/** Converts a nanosecond delta to seconds, subject to floating-point rounding. */
export function nsDeltaToSeconds(deltaNs: bigint): number {
  return (
    Number(deltaNs / NANOSECONDS_PER_SECOND) +
    Number(deltaNs % NANOSECONDS_PER_SECOND) / NANOSECONDS_PER_SECOND_NUMBER
  );
}
