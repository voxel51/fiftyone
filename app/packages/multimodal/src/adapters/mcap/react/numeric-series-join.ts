/**
 * Aligns independently-timed numeric series onto one shared x vector
 * for uPlot's `AlignedData`. Each input keeps its own timestamps
 * (fields can be missing per message and decimation diverges per
 * field); the join merges all timestamps and null-fills where a series
 * has no sample. NaN values (gap markers from extraction) also become
 * null so charts render gaps instead of interpolating through them.
 */
export interface JoinedNumericSeries {
  readonly xs: number[];
  readonly ys: (number | null)[][];
}

export function joinNumericSeries(
  series: readonly {
    readonly timesSec: Float64Array;
    readonly values: Float64Array;
  }[],
): JoinedNumericSeries {
  const merged = new Set<number>();
  for (const entry of series) {
    for (const time of entry.timesSec) {
      merged.add(time);
    }
  }
  const xs = [...merged].sort((a, b) => a - b);

  const ys = series.map((entry) => {
    const column: (number | null)[] = new Array(xs.length).fill(null);
    let cursor = 0;
    for (let i = 0; i < entry.timesSec.length; i += 1) {
      const time = entry.timesSec[i];
      while (cursor < xs.length && xs[cursor] < time) {
        cursor += 1;
      }
      if (cursor >= xs.length) {
        break;
      }
      if (xs[cursor] === time) {
        const value = entry.values[i];
        column[cursor] = Number.isNaN(value) ? null : value;
      }
    }
    return column;
  });

  return { xs, ys };
}
