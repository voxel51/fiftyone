/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A rail position is the thumb's travel along the track, in [0, 1]. An
 * offset rail (a SMALL order, a lane) maps the offset of the item at the
 * top of the view onto it; a value rail maps the top item's fraction, its
 * sort value between the order's bounds. Nothing here knows about pixels or
 * how pages are fetched.
 */

export interface RailTick {
  /** Along the track, in [0, 1]. */
  position: number;
  label: string;
}

/** A labelled offset of a list, e.g. one lane of many. */
export interface LabelledOffset {
  offset: number;
  label: string;
}

export const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export const clampOffset = (offset: number, total: number): number =>
  total <= 0 ? 0 : Math.min(Math.max(Math.round(offset), 0), total - 1);

export const offsetToPosition = (offset: number, total: number): number =>
  total <= 1 ? 0 : clampOffset(offset, total) / (total - 1);

/**
 * The last offset that can head the view: with `visible` items on screen,
 * the end of the order is reached before its last item reaches the top.
 */
const lastTop = (total: number, visible?: number) =>
  Math.max(0, total - Math.max(1, Math.round(visible ?? 1)));

export const positionToOffset = (
  position: number,
  total: number,
  visible?: number,
): number =>
  total <= 1 ? 0 : clampOffset(position * lastTop(total, visible), total);

/** The thumb sits at the offset of the item at the top of the view. */
export const thumbPosition = (
  offset: number | undefined,
  total: number,
  visible?: number,
): number => {
  const last = lastTop(total, visible);
  if (offset === undefined || last <= 0) return 0;
  return clamp01(offset / last);
};

export const groupDigits = (n: number): string =>
  String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const compactCount = (n: number): string => {
  const abs = Math.abs(n);
  for (const [bound, suffix] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ] as const) {
    if (abs >= bound) {
      return `${Number((n / bound).toPrecision(3))}${suffix}`;
    }
  }
  return String(n);
};

/** 1-based for people: offset 0 reads "1 of N". */
export const offsetLabel = (offset: number, total: number): string =>
  `${groupDigits(clampOffset(offset, total) + 1)} of ${groupDigits(total)}`;

/** Evenly spaced offset ticks, labelled 1-based. */
export const offsetTicks = (total: number, count: number): RailTick[] => {
  if (total <= 0 || count <= 0) return [];
  if (total === 1 || count === 1) return [{ position: 0, label: "1" }];

  const ticks: RailTick[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.round((i * (total - 1)) / (count - 1));
    ticks.push({
      position: offsetToPosition(offset, total),
      label: compactCount(offset + 1),
    });
  }
  return ticks;
};

/**
 * Ticks from labelled offsets, at most `max` of them. A run of equal labels
 * shows once, at its first offset.
 */
export const labelTicks = (
  values: readonly LabelledOffset[],
  total: number,
  max: number,
): RailTick[] => {
  const distinct: LabelledOffset[] = [];
  for (const value of values) {
    if (distinct[distinct.length - 1]?.label !== value.label) {
      distinct.push(value);
    }
  }

  const picked =
    distinct.length <= max
      ? distinct
      : Array.from(
          { length: max },
          (_, i) => distinct[Math.floor((i * distinct.length) / max)],
        );

  return picked.map(({ label, offset }) => ({
    label,
    position: offsetToPosition(offset, total),
  }));
};

/** The pixel extents of an instance: its viewport and its loaded rows. */
export interface Extent {
  viewport: number;
  /** Primary extent of the rows the instance has loaded. */
  loaded: number;
  /** Items those rows hold. */
  items: number;
  /** How far the view is scrolled along the primary axis. */
  scrolled?: number;
}

/**
 * Items the viewport holds at the loaded rows' density. Over the total it is
 * the viewport over the order's estimated full height, as a scrollbar's
 * thumb would be.
 */
export const extentVisible = ({ items, loaded, viewport }: Extent) =>
  items > 0 && loaded > 0 ? (viewport * items) / loaded : undefined;

/** The thumb's share of the track: the visible share of the order. */
export const thumbSpan = (
  visible: number | undefined,
  total: number,
  min: number,
): number => {
  if (total <= 0 || visible === undefined) return min;
  return Math.min(1, Math.max(min, visible / total));
};

/** The thumb's top edge, keeping the whole thumb on the track. */
export const thumbTop = (position: number, span: number): number =>
  clamp01(position) * (1 - span);

/** Index of the marker nearest a rail position, or -1 with none. */
export const nearestTick = (ticks: readonly RailTick[], position: number) => {
  let best = -1;
  for (let i = 0; i < ticks.length; i++) {
    const distance = Math.abs(ticks[i].position - position);
    if (best < 0 || distance < Math.abs(ticks[best].position - position)) {
      best = i;
    }
  }
  return best;
};

export type RailMode = "idle" | "awake" | "active";

/**
 * Faint at rest; visible while the grid scrolls or the pointer is near;
 * labelled only while hovered or dragged.
 */
export const railMode = ({
  dragging,
  hovered,
  scrolling,
}: {
  dragging: boolean;
  hovered: boolean;
  scrolling: boolean;
}): RailMode => (dragging || hovered ? "active" : scrolling ? "awake" : "idle");
