export interface RelativeTimeParts {
  readonly milliseconds: string;
  readonly negative: boolean;
  readonly seconds: string;
}

/** Splits a nanosecond delta into sign, whole seconds, and truncated millis. */
export function relativeTimeParts(deltaNs: bigint): RelativeTimeParts {
  const negative = deltaNs < 0n;
  const magnitude = negative ? -deltaNs : deltaNs;
  return {
    milliseconds: ((magnitude % 1_000_000_000n) / 1_000_000n)
      .toString()
      .padStart(3, "0"),
    negative,
    seconds: (magnitude / 1_000_000_000n).toString(),
  };
}
