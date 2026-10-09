/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Which pages to fetch ahead once an instance's page lands.
 */

import type { OrderMode } from "./pageCursors";

interface Linked {
  next: number | null;
  previous: number | null;
}

/**
 * The neighbors of page `key` worth warming, one deep in the direction the
 * instance moved from its `start` (both at the start). Only a SMALL or
 * INDEXED order warms backward; a SCROLL order and a skip-paged view warm
 * forward only. The page before comes first, so after a seek it warms
 * alongside the forward fill.
 */
export const warmKeys = (
  key: number,
  start: number,
  page: Linked,
  mode: OrderMode | undefined,
): number[] => {
  const keys: number[] = [];
  const backward = mode === "SMALL" || mode === "INDEXED";
  if (backward && key <= start && page.previous !== null) {
    keys.push(page.previous);
  }
  if (key >= start && page.next !== null) keys.push(page.next);
  return keys;
};
