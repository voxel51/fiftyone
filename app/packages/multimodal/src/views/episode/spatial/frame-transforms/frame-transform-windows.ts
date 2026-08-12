import type { EpisodeFrameTransformTimeRange } from "../../../../runtime/frame-transform-types";
import { maxBigIntPair, minBigIntPair } from "../../../../utils/bigint";

/** Maximum predecessor history included in a foreground placement window. */
export const DYNAMIC_TRANSFORM_LOOKBACK_NS = 500_000_000n;
/** Forward coverage requested while the playback clock is advancing. */
export const DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS = 1_000_000_000n;
/** Forward coverage requested for paused or play-pending placement. */
export const PAUSED_TRANSFORM_PLACEMENT_LOOKAHEAD_NS = 250_000_000n;

const DYNAMIC_TRANSFORM_RUNWAY_LOOKAHEAD_NS = 4_000_000_000n;
const DYNAMIC_TRANSFORM_RUNWAY_REFRESH_LOOKAHEAD_NS = 2_000_000_000n;
const DYNAMIC_TRANSFORM_RUNWAY_SEGMENT_NS = 1_500_000_000n;
const DYNAMIC_TRANSFORM_RUNWAY_OVERLAP_NS = 100_000_000n;

/** Produces the foreground transform window around one placement time. */
export function dynamicPlacementRangeForTime(
  timeNs: bigint,
  lookaheadNs = DYNAMIC_TRANSFORM_PLACEMENT_LOOKAHEAD_NS,
): EpisodeFrameTransformTimeRange {
  return {
    endTimeNs: timeNs + lookaheadNs,
    startTimeNs:
      timeNs > DYNAMIC_TRANSFORM_LOOKBACK_NS
        ? timeNs - DYNAMIC_TRANSFORM_LOOKBACK_NS
        : 0n,
  };
}

/** Produces the next overlapping runway segment, capped at the lookahead. */
export function dynamicRunwayExtensionRangeForTime({
  indexedCoverageEndNs,
  timeNs,
}: {
  readonly indexedCoverageEndNs: bigint | null;
  readonly timeNs: bigint;
}): EpisodeFrameTransformTimeRange | null {
  const targetEndTimeNs = timeNs + DYNAMIC_TRANSFORM_RUNWAY_LOOKAHEAD_NS;
  const extensionStartTimeNs =
    indexedCoverageEndNs === null
      ? timeNs
      : subtractWithFloor(
          indexedCoverageEndNs,
          DYNAMIC_TRANSFORM_RUNWAY_OVERLAP_NS,
        );
  const extensionEndTimeNs = minBigIntPair(
    targetEndTimeNs,
    extensionStartTimeNs + DYNAMIC_TRANSFORM_RUNWAY_SEGMENT_NS,
  );

  return extensionEndTimeNs <= extensionStartTimeNs
    ? null
    : {
        endTimeNs: extensionEndTimeNs,
        startTimeNs: extensionStartTimeNs,
      };
}

/** Produces the minimum runway coverage needed before another idle read. */
export function dynamicRunwayCoverageRangeForTime(
  timeNs: bigint,
): EpisodeFrameTransformTimeRange {
  return {
    endTimeNs: timeNs + DYNAMIC_TRANSFORM_RUNWAY_REFRESH_LOOKAHEAD_NS,
    startTimeNs: timeNs,
  };
}

/** Extends indexed coverage with any in-flight range covering the playhead. */
export function transformCoverageEndForTime({
  indexedCoverageEndNs,
  inFlightRanges,
  timeNs,
}: {
  readonly indexedCoverageEndNs: bigint | null;
  readonly inFlightRanges: readonly EpisodeFrameTransformTimeRange[];
  readonly timeNs: bigint;
}): bigint | null {
  let coverageEnd = indexedCoverageEndNs;
  for (const range of inFlightRanges) {
    if (range.startTimeNs <= timeNs && timeNs <= range.endTimeNs) {
      coverageEnd =
        coverageEnd === null
          ? range.endTimeNs
          : maxBigIntPair(coverageEnd, range.endTimeNs);
    }
  }
  return coverageEnd;
}

/** Stable identity for one exact transform range. */
export function frameTransformRangeKey(
  range: EpisodeFrameTransformTimeRange,
): string {
  return `${range.startTimeNs}:${range.endTimeNs}`;
}

/** Whether one time is covered by any inclusive range. */
export function isTimeInRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  timeNs: bigint,
): boolean {
  return ranges.some(
    (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs,
  );
}

/** Whether one requested range is fully covered by any existing range. */
export function isRangeInRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  requested: EpisodeFrameTransformTimeRange,
): boolean {
  return ranges.some(
    (range) =>
      range.startTimeNs <= requested.startTimeNs &&
      requested.endTimeNs <= range.endTimeNs,
  );
}

function subtractWithFloor(value: bigint, amount: bigint): bigint {
  return value > amount ? value - amount : 0n;
}
