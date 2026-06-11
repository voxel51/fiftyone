/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ID } from "./types";

/** Fired on {@link Spotlight} when the initial fill has completed and items are ready to display. */
export class Load<K> extends Event {
  /**
   * @param page - The pagination cursor that was active when loading completed.
   */
  constructor(readonly page: K) {
    super("load");
  }
}

/**
 * Fired on {@link Spotlight} when the rendered items exceed `maxItemsSizeBytes`.
 * The `recommendedRowAspectRatioThreshold` is a suggested lower value for
 * `rowAspectRatioThreshold` that would fit within the memory budget.
 */
export class Rejected extends Event {
  /**
   * @param recommendedRowAspectRatioThreshold - Suggested aspect-ratio threshold to reduce memory usage.
   */
  constructor(readonly recommendedRowAspectRatioThreshold: number) {
    super("rejected");
  }
}

/**
 * Fired on {@link Spotlight} whenever the topmost visible row changes, e.g. during
 * scrolling or after a section swap. Used to persist and restore scroll position.
 */
export class RowChange<K> extends Event {
  /**
   * @param at - ID of the first item in the topmost visible row.
   * @param page - Pagination cursor for the page that item belongs to.
   * @param offset - Pixel distance from the top of the row to the viewport edge.
   */
  constructor(
    readonly at: ID,
    readonly page: K,
    readonly offset: number
  ) {
    super("rowchange");
  }
}

type EventListener<E extends Event> = (evt: E) => void;

interface EventListenerObject<E extends Event> {
  handleEvent(object: E): void;
}

/** A typed event callback — either a plain function or an object with `handleEvent`. */
export type EventCallback<E extends Event> =
  | EventListener<E>
  | EventListenerObject<E>;
