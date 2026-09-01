/** An interval this module can place; only the span matters. */
export interface PackableInterval {
  readonly start: number;
  readonly end: number;
}

/**
 * Level of an interval that did not fit: every level was already busy where it
 * starts. It is not drawn.
 */
export const UNPLACED = -1;

export interface PackedIntervals {
  /**
   * Assigned level per input interval, in input order, or {@link UNPLACED} for
   * one that did not fit.
   */
  readonly levels: readonly number[];
  /** Levels actually used; at least 1, even for an empty input. */
  readonly levelCount: number;
}

/**
 * Greedy interval packing: assign each interval (earliest first) to the lowest
 * level free at its start.
 *
 * An interval arriving when every one of `maxLevels` levels is busy is left
 * {@link UNPLACED} rather than stacked onto the top level. Stacking it there
 * would draw it over the interval already occupying that level, which reads as
 * a mark floating loose on top of the lane and misrepresents both — better to
 * draw neither than to draw one wrong. Callers that must not lose it can still
 * report it some other way; only its place in the lane is gone.
 *
 * Source-agnostic on purpose — the grid tile packs every source's intervals
 * together in one call, so intervals from different sources share levels and
 * adding a source never makes the tile taller.
 */
export function packIntervals(
  intervals: readonly PackableInterval[],
  maxLevels: number,
): PackedIntervals {
  const order = intervals
    .map((_, index) => index)
    .sort(
      (a, b) =>
        intervals[a].start - intervals[b].start ||
        intervals[a].end - intervals[b].end,
    );
  const levelEnds: number[] = [];
  const levels = new Array<number>(intervals.length);
  for (const index of order) {
    const interval = intervals[index];
    const free = levelEnds.findIndex((end) => end <= interval.start);
    if (free !== -1) {
      levelEnds[free] = interval.end;
      levels[index] = free;
      continue;
    }
    if (levelEnds.length < maxLevels) {
      levels[index] = levelEnds.length;
      levelEnds.push(interval.end);
      continue;
    }
    levels[index] = UNPLACED;
  }

  return { levels, levelCount: Math.max(levelEnds.length, 1) };
}
