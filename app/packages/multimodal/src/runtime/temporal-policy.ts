const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;

/** Number of recent positive message intervals used to estimate cadence. */
const MAX_CADENCE_INTERVALS = 32;
/** Avoid adapting a policy from only one or two intervals. */
const MIN_CADENCE_INTERVALS = 3;

/** Transform interpolation limit before enough cadence evidence exists. */
export const DEFAULT_TRANSFORM_INTERPOLATION_GAP_NS =
  2n * NANOSECONDS_PER_SECOND;
const MIN_TRANSFORM_INTERPOLATION_GAP_NS = 100n * NANOSECONDS_PER_MILLISECOND;
const MAX_TRANSFORM_INTERPOLATION_GAP_NS = 2n * NANOSECONDS_PER_SECOND;

/** Observation freshness threshold before enough cadence evidence exists. */
export const DEFAULT_OBSERVATION_STALE_THRESHOLD_NS =
  500n * NANOSECONDS_PER_MILLISECOND;
const MIN_OBSERVATION_STALE_THRESHOLD_NS = 500n * NANOSECONDS_PER_MILLISECOND;
const MAX_OBSERVATION_STALE_THRESHOLD_NS = 5n * NANOSECONDS_PER_SECOND;

/**
 * Median cadence from at most the latest 32 positive adjacent intervals.
 * Duplicate timestamps are ignored and fewer than three intervals are
 * deliberately treated as insufficient evidence.
 */
export function recentMedianCadenceNs(
  timestamps: readonly bigint[],
): bigint | null {
  if (timestamps.length < MIN_CADENCE_INTERVALS + 1) {
    return null;
  }

  const sorted = [...new Set(timestamps)].sort(compareBigInts);
  const firstTimestampIndex = Math.max(
    0,
    sorted.length - (MAX_CADENCE_INTERVALS + 1),
  );
  const intervals: bigint[] = [];
  for (let index = firstTimestampIndex + 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous === undefined || current === undefined) continue;
    const interval = current - previous;
    if (interval > 0n) intervals.push(interval);
  }

  if (intervals.length < MIN_CADENCE_INTERVALS) {
    return null;
  }

  intervals.sort(compareBigInts);
  const middle = Math.floor(intervals.length / 2);
  const upper = intervals[middle] as bigint;
  if (intervals.length % 2 === 1) {
    return upper;
  }
  const lower = intervals[middle - 1] as bigint;
  return (lower + upper) / 2n;
}

/** Adaptive transform interpolation limit derived from a message cadence. */
export function transformInterpolationGapLimitNs(
  timestamps: readonly bigint[],
): bigint {
  return cadenceDerivedLimitNs({
    cadenceNs: recentMedianCadenceNs(timestamps),
    fallbackNs: DEFAULT_TRANSFORM_INTERPOLATION_GAP_NS,
    maxNs: MAX_TRANSFORM_INTERPOLATION_GAP_NS,
    minNs: MIN_TRANSFORM_INTERPOLATION_GAP_NS,
  });
}

/** Adaptive stale-frame threshold derived from an observation cadence. */
export function observationStaleThresholdNs(
  timestamps: readonly bigint[],
): bigint {
  return cadenceDerivedLimitNs({
    cadenceNs: recentMedianCadenceNs(timestamps),
    fallbackNs: DEFAULT_OBSERVATION_STALE_THRESHOLD_NS,
    maxNs: MAX_OBSERVATION_STALE_THRESHOLD_NS,
    minNs: MIN_OBSERVATION_STALE_THRESHOLD_NS,
  });
}

/**
 * Bounded, source-local timestamp history for hot playback paths. It retains
 * only the 33 timestamps needed to derive the latest 32 intervals.
 */
export class EpisodeCadenceTracker {
  private readonly timestamps: bigint[] = [];

  clear(): void {
    this.timestamps.length = 0;
  }

  observe(timestampNs: bigint): void {
    const insertionIndex = lowerBound(this.timestamps, timestampNs);
    if (this.timestamps[insertionIndex] === timestampNs) {
      return;
    }
    this.timestamps.splice(insertionIndex, 0, timestampNs);
    const maxTimestamps = MAX_CADENCE_INTERVALS + 1;
    if (this.timestamps.length > maxTimestamps) {
      this.timestamps.splice(0, this.timestamps.length - maxTimestamps);
    }
  }

  observationStaleThresholdNs(): bigint {
    return observationStaleThresholdNs(this.timestamps);
  }

  interpolationGapLimitNs(): bigint {
    return transformInterpolationGapLimitNs(this.timestamps);
  }

  /** Median cadence when enough observations exist to make a cost decision. */
  medianCadenceNs(): bigint | null {
    return recentMedianCadenceNs(this.timestamps);
  }
}

function cadenceDerivedLimitNs({
  cadenceNs,
  fallbackNs,
  maxNs,
  minNs,
}: {
  readonly cadenceNs: bigint | null;
  readonly fallbackNs: bigint;
  readonly maxNs: bigint;
  readonly minNs: bigint;
}): bigint {
  if (cadenceNs === null) return fallbackNs;
  const scaled = cadenceNs * 3n;
  return scaled < minNs ? minNs : scaled > maxNs ? maxNs : scaled;
}

function lowerBound(values: readonly bigint[], target: bigint): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const value = values[middle] as bigint;
    if (value < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function compareBigInts(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
