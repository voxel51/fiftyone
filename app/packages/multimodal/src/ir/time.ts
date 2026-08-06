/** Nanoseconds in one second. */
export const NANOSECONDS_PER_SECOND = 1_000_000_000n;

/** Inclusive nanosecond range used by episode and stream reads. */
export interface NsRange {
  readonly endNs: bigint;
  readonly startNs: bigint;
}

/** Inclusive playback window requested from an episode session. */
export type TimeWindow = NsRange;

/** Physical interpretation of an episode's active time axis. */
export type TimeDomainKind = "duration" | "sequence" | "timestamp";

/** Cloneable description of the time axis used by an episode manifest. */
export interface TimeDomain {
  readonly id: string;
  readonly kind: TimeDomainKind;
  readonly originNs?: bigint;
}

/** One point on a cumulative encoded-byte curve over episode time. */
export interface ByteTimelinePoint {
  readonly cumulativeCompressedBytes: number;
  readonly endTimeNs: bigint;
  readonly startOffsetBytes: bigint;
}

/** Comparator for nanosecond/bigint values suitable for stable array sorting. */
export function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
