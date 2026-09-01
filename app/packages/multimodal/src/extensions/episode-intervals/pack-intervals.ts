/** An interval this module can place; only the span matters. */
export interface PackableInterval {
  readonly start: number;
  readonly end: number;
}

export interface PackedIntervals {
  /** Assigned level per input interval, in input order. */
  readonly levels: readonly number[];
  /** Levels actually used; at least 1, even for an empty input. */
  readonly levelCount: number;
}

/**
 * Greedy interval packing: assign each interval (earliest first) to the lowest
 * level free at its start; overflow past `maxLevels` stacks onto the top level
 * rather than growing the lane unbounded.
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
    let assigned = levelEnds.findIndex((end) => end <= interval.start);
    if (assigned === -1) {
      if (levelEnds.length < maxLevels) {
        assigned = levelEnds.length;
        levelEnds.push(interval.end);
      } else {
        assigned = maxLevels - 1;
        levelEnds[assigned] = Math.max(levelEnds[assigned], interval.end);
      }
    } else {
      levelEnds[assigned] = interval.end;
    }
    levels[index] = assigned;
  }

  return { levels, levelCount: Math.max(levelEnds.length, 1) };
}
