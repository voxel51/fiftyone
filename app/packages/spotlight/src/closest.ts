/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ONE, TWO, ZERO } from "./constants";

/**
 * Binary search for the row whose `top` value is closest to `target`.
 *
 * Returns `null` for an empty array. When `target` is outside the range of
 * all rows the nearest boundary row is returned with a signed delta so callers
 * can tell which direction they overshot.
 *
 * @param rows - Sorted array of items to search.
 * @param target - The position (px) to find the closest row for.
 * @param top - Accessor that returns the top edge (px) of an item.
 * @param lo - Lower bound index for the current search window.
 * @param hi - Upper bound index for the current search window.
 * @returns The index of the closest row and its signed distance from `target`, or `null` if `rows` is empty.
 */
export function closest<I>(
  rows: I[],
  target: number,
  top: (item: I) => number,
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
