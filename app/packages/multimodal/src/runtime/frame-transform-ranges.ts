import type { EpisodeFrameTransformTimeRange } from "./frame-transform-types";

/** Whether canonical transform coverage contains a timestamp. */
export function isFrameTransformTimeIndexed(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  timeNs: bigint,
): boolean {
  return ranges.some(
    (range) => range.startTimeNs <= timeNs && timeNs <= range.endTimeNs,
  );
}

/** Whether one canonical transform coverage range contains the full window. */
export function isFrameTransformRangeIndexed(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  range: EpisodeFrameTransformTimeRange,
): boolean {
  return ranges.some(
    (indexedRange) =>
      indexedRange.startTimeNs <= range.startTimeNs &&
      range.endTimeNs <= indexedRange.endTimeNs,
  );
}

/** End of the canonical transform coverage range containing a timestamp. */
export function frameTransformIndexedRangeEndCovering(
  ranges: readonly EpisodeFrameTransformTimeRange[],
  timeNs: bigint,
): bigint | null {
  const range = ranges.find(
    (candidate) =>
      candidate.startTimeNs <= timeNs && timeNs <= candidate.endTimeNs,
  );
  return range?.endTimeNs ?? null;
}

/**
 * Sorts transform coverage and merges overlapping, touching, or integer-
 * adjacent nanosecond ranges into one canonical coverage set.
 */
export function mergeFrameTransformTimeRanges(
  ranges: readonly EpisodeFrameTransformTimeRange[],
): readonly EpisodeFrameTransformTimeRange[] {
  const sorted = [...ranges].sort((left, right) => {
    if (left.startTimeNs !== right.startTimeNs) {
      return left.startTimeNs < right.startTimeNs ? -1 : 1;
    }
    return left.endTimeNs === right.endTimeNs
      ? 0
      : left.endTimeNs < right.endTimeNs
        ? -1
        : 1;
  });
  const merged: EpisodeFrameTransformTimeRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.startTimeNs > previous.endTimeNs + 1n) {
      merged.push(range);
      continue;
    }
    merged[merged.length - 1] = {
      endTimeNs:
        previous.endTimeNs > range.endTimeNs
          ? previous.endTimeNs
          : range.endTimeNs,
      startTimeNs: previous.startTimeNs,
    };
  }

  return merged;
}
