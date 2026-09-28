/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The rail maps rank, a sample's index in the view's order, to a position
 * in [0, 1] along the track. Equal rail distance means an equal number of
 * samples; nothing here knows about pixels or how pages are fetched.
 */

export interface RailTick {
  /** Along the track, in [0, 1]. */
  position: number;
  label: string;
}

/** A labelled rank from an order, e.g. a server boundary. */
export interface RankedValue {
  rank: number;
  label: string;
  value?: unknown;
}

/** Where a jump lands: the rank, and the page that holds it. */
export interface JumpTarget {
  rank: number;
  key: number;
}

export const clampRank = (rank: number, total: number): number =>
  total <= 0 ? 0 : Math.min(Math.max(Math.round(rank), 0), total - 1);

export const rankToPosition = (rank: number, total: number): number =>
  total <= 1 ? 0 : clampRank(rank, total) / (total - 1);

export const positionToRank = (position: number, total: number): number =>
  total <= 1 ? 0 : clampRank(position * (total - 1), total);

/** The thumb sits at the rank of the item at the top of the view. */
export const thumbPosition = (
  anchorRank: number | undefined,
  total: number,
): number => (anchorRank === undefined ? 0 : rankToPosition(anchorRank, total));

export const jumpTarget = (
  position: number,
  total: number,
  pageSize: number,
): JumpTarget => {
  const rank = positionToRank(position, total);
  return { rank, key: Math.floor(rank / pageSize) };
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

/** 1-based for people: rank 0 reads "#1 of N". */
export const rankLabel = (rank: number, total: number): string =>
  `#${groupDigits(clampRank(rank, total) + 1)} of ${groupDigits(total)}`;

/** Evenly spaced rank ticks, labelled by 1-based rank. */
export const rankTicks = (total: number, count: number): RailTick[] => {
  if (total <= 0 || count <= 0) return [];
  if (total === 1 || count === 1) return [{ position: 0, label: "1" }];

  const ticks: RailTick[] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.round((i * (total - 1)) / (count - 1));
    ticks.push({
      position: rankToPosition(rank, total),
      label: compactCount(rank + 1),
    });
  }
  return ticks;
};

/**
 * Ticks from an order's labelled ranks, at most `max` of them. A run of
 * equal labels (a tied block) shows once, at its first rank.
 */
export const labelTicks = (
  values: readonly RankedValue[],
  total: number,
  max: number,
): RailTick[] => {
  const distinct: RankedValue[] = [];
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

  return picked.map(({ label, rank }) => ({
    label,
    position: rankToPosition(rank, total),
  }));
};

/** The label of the last value at or before `rank`, for a drag tooltip. */
export const labelAt = (
  values: readonly RankedValue[],
  rank: number,
): string | undefined => {
  let lo = 0;
  let hi = values.length - 1;
  let found: RankedValue | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid].rank <= rank) {
      found = values[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found?.label;
};

/** Where the rank-rate sample was taken: top rank and scroll offset. */
export interface ScrollSample {
  rank: number;
  offset: number;
}

/**
 * Items on screen, from how fast the top rank moves per pixel of scroll
 * between two samples. Undefined until the samples differ.
 */
export const visibleEstimate = (
  previous: ScrollSample,
  next: ScrollSample,
  viewport: number,
): number | undefined => {
  const pixels = Math.abs(next.offset - previous.offset);
  const ranks = Math.abs(next.rank - previous.rank);
  if (pixels === 0 || ranks === 0 || viewport <= 0) return undefined;
  return Math.round((ranks / pixels) * viewport);
};

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
  Math.min(Math.max(position, 0), 1) * (1 - span);

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
