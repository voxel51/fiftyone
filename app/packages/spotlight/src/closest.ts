/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import type Row from "./row";

export function closest<V>(
  rows: Row<V>[],
  target: number,
  top: (row: Row<V>) => number,
  lo = 0,
  hi = rows.length - 1
): { index: number; delta: number } {
  if (!rows.length) {
    return null;
  }

  const loDelta = target - top(rows[lo]);

  if (loDelta < 0) {
    return { index: lo, delta: loDelta };
  }
  const hiDelta = target - top(rows[hi]);
  if (hiDelta > 0) {
    return { index: hi, delta: hiDelta };
  }

  if (hi - lo < 2) {
    return Math.abs(loDelta) < Math.abs(hiDelta)
      ? { index: lo, delta: loDelta }
      : { index: hi, delta: hiDelta };
  }

  const mid = Math.floor((hi + lo) / 2);
  const midDelta = target - top(rows[mid]);

  if (midDelta < 0) {
    return closest(rows, target, top, lo, mid);
  }

  if (midDelta > 0) {
    return closest(rows, target, top, mid, hi);
  }

  return { index: mid, delta: midDelta };
}
