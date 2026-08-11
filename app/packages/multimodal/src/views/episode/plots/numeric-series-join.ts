/**
 * Aligns independently-timed numeric series onto one shared x vector
 * for uPlot's `AlignedData`. Each input keeps its own timestamps
 * (fields can be missing per message and decimation diverges per
 * field); the join merges all timestamps and leaves alignment-only
 * positions undefined. NaN values (gap markers from extraction) become
 * null so uPlot renders real gaps instead of interpolating through them.
 */
export interface JoinedNumericSeries {
  readonly xs: number[];
  readonly ys: (number | null | undefined)[][];
}

export function joinNumericSeries(
  series: readonly {
    readonly timesSec: Float64Array;
    readonly values: Float64Array;
  }[],
): JoinedNumericSeries {
  const xs = mergeSortedTimestamps(series.map((entry) => entry.timesSec));

  const ys = series.map((entry) => {
    const column = Array.from<unknown, number | null | undefined>(
      { length: xs.length },
      () => undefined,
    );
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
        if (Number.isNaN(value)) {
          // A real sample at the same timestamp is stronger evidence than a
          // gap marker. Otherwise retain the gap for uPlot.
          if (column[cursor] === undefined) column[cursor] = null;
        } else {
          // For duplicate finite samples, the later input wins.
          column[cursor] = value;
        }
      }
    }
    return column;
  });

  return { xs, ys };
}

interface TimestampCursor {
  readonly column: number;
  readonly index: number;
  readonly time: number;
}

/** K-way merge of already-sorted viewport inputs; no full-history Set/sort. */
function mergeSortedTimestamps(columns: readonly Float64Array[]): number[] {
  const heap: TimestampCursor[] = [];
  for (let column = 0; column < columns.length; column += 1) {
    if (columns[column].length > 0) {
      pushTimestamp(heap, { column, index: 0, time: columns[column][0] });
    }
  }

  const merged: number[] = [];
  while (heap.length > 0) {
    const cursor = popTimestamp(heap);
    if (merged.at(-1) !== cursor.time) merged.push(cursor.time);
    const nextIndex = cursor.index + 1;
    const column = columns[cursor.column];
    if (nextIndex < column.length) {
      pushTimestamp(heap, {
        column: cursor.column,
        index: nextIndex,
        time: column[nextIndex],
      });
    }
  }
  return merged;
}

function pushTimestamp(heap: TimestampCursor[], cursor: TimestampCursor): void {
  let index = heap.length;
  heap.push(cursor);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (!timestampCursorBefore(heap[index], heap[parent])) break;
    [heap[index], heap[parent]] = [heap[parent], heap[index]];
    index = parent;
  }
}

function popTimestamp(heap: TimestampCursor[]): TimestampCursor {
  const first = heap[0];
  const last = heap.pop();
  if (!last || heap.length === 0) return first;
  heap[0] = last;
  let index = 0;
  for (;;) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child =
      right < heap.length && timestampCursorBefore(heap[right], heap[left])
        ? right
        : left;
    if (!timestampCursorBefore(heap[child], heap[index])) break;
    [heap[index], heap[child]] = [heap[child], heap[index]];
    index = child;
  }
  return first;
}

function timestampCursorBefore(
  left: TimestampCursor,
  right: TimestampCursor,
): boolean {
  if (left.time !== right.time) return left.time < right.time;
  if (left.column !== right.column) return left.column < right.column;
  return left.index < right.index;
}
