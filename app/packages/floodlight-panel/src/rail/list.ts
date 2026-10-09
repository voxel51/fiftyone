/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export interface ListItem {
  top: number;
  height: number;
}

/**
 * The first item showing in a scrolled list, and how many show. Items are
 * in list order; offsets are in the scroller's content.
 */
export const listWindow = (
  items: readonly ListItem[],
  scrollTop: number,
  viewport: number,
): { first: number; visible: number } => {
  const bottom = scrollTop + viewport;
  let first = -1;
  let visible = 0;
  items.forEach(({ height, top }, index) => {
    if (top + height <= scrollTop || top >= bottom) return;
    if (first < 0) first = index;
    visible++;
  });
  return { first: Math.max(first, 0), visible };
};
