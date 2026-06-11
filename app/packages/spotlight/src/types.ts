/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type Spotlight from "./index";

/** Scroll-restore position: item description plus an optional pixel offset within the row. */
export interface At {
  description: string;
  offset?: number;
}

/** Cursor and optional item remainder held at a section boundary. */
export interface Edge<K, V> {
  key: K | null;
  remainder?: ItemData<K, V>[];
}

/**
 * Gets or sets the currently focused item.
 * Called with an `id` to update focus; called with no argument to read it.
 */
export type Focus = (id?: ID) => ID | undefined;

/** Fetches a page of items for the given pagination cursor. */
export type Get<K, V> = (key: K) => Promise<Response<K, V>>;

/** Called when an item is scrolled out of the render buffer and should release its resources. */
export type Hide = (ctx: { id: ID }) => void;

/** Handler invoked when the user clicks an item. */
export type ItemClick<K, V> = (
  callbackInterface: ItemClickInterface<K, V>
) => void;

/** Arguments passed to {@link ItemClick}. */
export interface ItemClickInterface<K, V> {
  event?: MouseEvent;
  item: ItemData<K, V>;
  /** Iterator for navigating to adjacent items from the click site. */
  iter: { next: (from: number, soft?: boolean) => Promise<ID | undefined> };
}

/** Stable identity for a grid item, used as a `WeakMap` key. */
export type ID = { description: string };

/** A single item as returned by {@link Get} and passed to {@link Show}. */
export interface ItemData<K, V> {
  /** Width divided by height; drives the tiling algorithm. */
  aspectRatio: number;
  /** Arbitrary caller-supplied payload. */
  data: V;
  id: ID;
  /** Pagination cursor for the page this item belongs to. */
  key: K;
}

/**
 * Records the byte size of a rendered item so the memory-limit logic can track total usage.
 * Only active when `maxItemsSizeBytes` is set on {@link SpotlightConfig}.
 */
export type Measure<K, V> = (
  id: ItemData<K, V>,
  sizeBytes: Promise<number>
) => void;

/** Raw page payload returned by {@link SpotlightConfig.get}. */
export interface Response<K, V> {
  items: ItemData<K, V>[];
  next: K | null;
  previous: K | null;
}

/**
 * Internal page-fetch contract used between {@link Spotlight} and {@link Section}.
 * Wraps {@link Get} to attach the focus function and handle cursor direction.
 */
export type Request<K, V> = (key: K) => Promise<{
  items: ItemData<K, V>[];
  focus: Focus;
  next?: K;
  previous?: K;
}>;

/**
 * Renders an item into `element` at the given `dimensions` and returns its byte size.
 * Called every time an item enters the render buffer; `zooming` is `true` during fast scrolls.
 */
export type Show<K, V> = (ctx: {
  id: ID;
  dimensions: [number, number];
  element: HTMLDivElement;
  spotlight: Spotlight<K, V>;
  zooming: boolean;
}) => Promise<number>;

/** Configuration passed to the {@link Spotlight} constructor. */
export interface SpotlightConfig<K, V> {
  /** Item or offset to scroll to on initial render. */
  at?: At;
  /**
   * When `true` the grid scrolls horizontally and each item fills the full container height,
   * with its width proportional to its aspect ratio. Defaults to `false` (vertical scroll).
   */
  horizontal?: boolean;
  /** Starting pagination cursor. */
  key: K;
  /** Maximum rows per section before it is swapped out. Defaults to {@link DEFAULT_MAX_ROWS}. */
  maxRows?: number;
  /** Byte budget for rendered items; when exceeded a `rejected` event fires. Requires `getItemSizeBytes`. */
  maxItemsSizeBytes?: number;
  /** Viewport padding (px) used as a render buffer. Defaults to {@link DEFAULT_OFFSET}. */
  offset?: number;
  /** Show the native scrollbar. */
  scrollbar?: boolean;
  /**
   * When `false`, the initial fill loads exactly one forward page and
   * does not auto-pull additional pages to cover the viewport.
   * Subsequent pages still load on user scroll. Defaults to `true`
   * (auto-fill until the viewport is covered in both directions).
   * Used by swimlane inner rows to immediately show the local cover
   * sample and defer sibling-slice fetches to a separate request.
   */
  fill?: boolean;
  /** Pixel gap between items and rows. Defaults to {@link DEFAULT_SPACING}. */
  spacing?: number;

  /** Called when an item is permanently removed from the grid. */
  detachItem: (id: ID) => void;
  /** Fetches a page of items for the given cursor. */
  get: Get<K, V>;
  /** Returns the current byte size of a rendered item; required when `maxItemsSizeBytes` is set. */
  getItemSizeBytes?: (id: ID) => number;
  /** Called when an item leaves the render buffer. */
  hideItem: Hide;
  /** Called when the user clicks an item (not fired when Meta/Shift/Ctrl is held). */
  onItemClick?: ItemClick<K, V>;
  /** Returns the target row aspect ratio for the given cross extent (viewport width in vertical mode, height in horizontal); drives the tiling algorithm. */
  rowAspectRatioThreshold: (crossExtent: number) => number;
  /** Called when an item enters the render buffer; must resolve with the item's byte size. */
  showItem: Show<K, V>;
}

/** Called with each item's ID when {@link Spotlight.updateItems} propagates an update. */
export type Updater = (id: ID) => void;

/** Public interface for navigating through grid items programmatically. */
export interface Iter {
  /**
   * Moves `from` steps from the current position and returns the resulting item ID.
   * Negative values move backward. Pass `soft=true` to preview without updating internal state.
   * @param from - Number of steps to move; negative to go backward.
   * @param soft - When `true`, does not update focus or section state.
   * @returns The ID of the item `from` steps away, or `undefined` if the boundary is reached.
   */
  next(from: number, soft?: boolean): Promise<ID | undefined>;
}
