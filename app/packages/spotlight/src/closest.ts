/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { ONE, TWO, ZERO } from "./constants";
import type Row from "./row";

export function closest<V>(
  rows: Row<V>[],
  target: number,
  top: (row: Row<V>) => number,
  lo = ZERO,
  hi = rows.length - ONE
): { index: number; delta: number } {
  if (!rows.length) {
    return null;
  }

  const loDelta = target - top(rows[lo]);

  if (loDelta < ZERO) {
    return { index: lo, delta: loDelta };
  }
  const hiDelta = target - top(rows[hi]);
  if (hiDelta > ZERO) {
    return { index: hi, delta: hiDelta };
  }

  if (hi - lo < TWO) {
    return Math.abs(loDelta) < Math.abs(hiDelta)
      ? { index: lo, delta: loDelta }
      : { index: hi, delta: hiDelta };
  }

  const mid = Math.floor((hi + lo) / TWO);
  const midDelta = target - top(rows[mid]);

  if (midDelta < ZERO) {
    return closest(rows, target, top, lo, mid);
  }

  if (midDelta > ZERO) {
    return closest(rows, target, top, mid, hi);
  }

  return { index: mid, delta: midDelta };
}
