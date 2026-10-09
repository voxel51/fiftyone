/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-lane heights a user set by dragging a lane's bottom edge, keyed by lane
 * identity: a group id for Groups rows, a field value for Lanes.
 */

import type { FieldValue } from "./categorical";

export const MIN_LANE_HEIGHT = 48;
export const MAX_LANE_HEIGHT = 960;
/** Pixels one ArrowUp/ArrowDown press moves a focused handle. */
export const LANE_HEIGHT_STEP = 16;

// Floodlight insets rows by its scrollbar gutter on both sides.
const ROW_INSET = 28;

export type LaneHeights = Readonly<Record<string, number>>;

export const clampLaneHeight = (height: number) =>
  Math.round(Math.min(Math.max(height, MIN_LANE_HEIGHT), MAX_LANE_HEIGHT));

export const groupLaneKey = (groupId: string) => `group:${groupId}`;

export const fieldLaneKey = (path: string, value: FieldValue) =>
  `lane:${path}:${JSON.stringify(value)}`;

/** Sets a lane's height, or resets it to the default when `height` is undefined. */
export const setLaneHeight = (
  heights: LaneHeights,
  key: string,
  height?: number,
): LaneHeights => {
  if (height === undefined) {
    if (!(key in heights)) return heights;
    const { [key]: _, ...rest } = heights;
    return rest;
  }
  const next = clampLaneHeight(height);
  return heights[key] === next ? heights : { ...heights, [key]: next };
};

export const laneHeight = (
  heights: LaneHeights,
  key: string,
  fallback: number,
) => heights[key] ?? fallback;

interface AspectItem {
  aspectRatio: number;
}

/**
 * The row aspect ratio each Groups item gets from its lane's custom height at
 * a container `width`, or `undefined` when no group lane has one.
 */
export const rowAspectOverride = <T extends AspectItem>(
  heights: LaneHeights,
  width: number,
  groupOf: (item: T) => string | undefined,
): ((item: T) => number | undefined) | undefined => {
  if (!Object.keys(heights).some((key) => key.startsWith("group:"))) {
    return undefined;
  }
  const row = Math.max(1, width - ROW_INSET);
  return (item) => {
    const group = groupOf(item);
    const height =
      group === undefined ? undefined : heights[groupLaneKey(group)];
    return height === undefined ? undefined : row / height;
  };
};

/** Applies an override to a page's items, returning the page itself when nothing changes. */
export const withRowAspects = <T extends AspectItem, P extends { items: T[] }>(
  page: P,
  aspectOf?: (item: T) => number | undefined,
): P => {
  if (!aspectOf) return page;
  let changed = false;
  const items = page.items.map((item) => {
    const aspectRatio = aspectOf(item);
    if (aspectRatio === undefined || aspectRatio === item.aspectRatio) {
      return item;
    }
    changed = true;
    return { ...item, aspectRatio };
  });
  return changed ? { ...page, items } : page;
};
