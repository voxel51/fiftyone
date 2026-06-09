/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * A `[start, end]` span of 1-indexed frame numbers, both ends inclusive.
 * Streams track which frames they've fetched as a sorted, disjoint list of
 * these.
 */
export type FrameRange = [number, number];

/**
 * Merge a newly-fetched `[start, end]` range into a sorted, disjoint list of
 * contiguous ranges, in place. Ranges that touch or overlap (`cur.start <=
 * prev.end + 1`) collapse, so adjacent chunks coalesce into one span.
 */
export function mergeRange(ranges: Array<FrameRange>, add: FrameRange): void {
  ranges.push(add);
  ranges.sort((a, b) => a[0] - b[0]);

  for (let i = ranges.length - 1; i > 0; i--) {
    const prev = ranges[i - 1];
    const cur = ranges[i];

    if (cur[0] <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], cur[1]);
      ranges.splice(i, 1);
    }
  }
}

/** Whether `frame` falls within any fetched range (both ends inclusive). */
export function isInFetchedRange(
  ranges: ReadonlyArray<FrameRange>,
  frame: number
): boolean {
  for (const [start, end] of ranges) {
    if (frame >= start && frame <= end) {
      return true;
    }
  }
  return false;
}

/**
 * Project 1-indexed frame ranges onto stream-time second ranges — the form
 * the timeline's buffered-bar consumes. The start shifts back one frame so a
 * fetched frame covers the interval leading up to its timestamp.
 */
export function toSecondRanges(
  ranges: ReadonlyArray<FrameRange>,
  frameRate: number
): Array<FrameRange> {
  return ranges.map(
    ([start, end]) => [(start - 1) / frameRate, end / frameRate] as FrameRange
  );
}
