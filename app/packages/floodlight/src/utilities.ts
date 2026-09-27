/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createAxis } from "./axis";
import { ZERO } from "./constants";
import { RowChange } from "./events";
import type Row from "./row";
import type Section from "./section";
import type { At, ID } from "./types";

interface Match<K, V> {
  row: Row<K, V>;
  delta: number;
}

interface Matches<K, V> {
  backward?: Match<K, V>;
  forward?: Match<K, V>;
}

/** Typed wrapper around `document.createElement`. */
export const create = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
): HTMLElementTagNameMap[K] => {
  return document.createElement(tagName);
};

/**
 * Returns the scroll position that places `at`'s row at its anchor offset,
 * searching the forward section then the backward one, or `undefined` if
 * neither holds the item.
 */
const anchorPosition = <K, V>(
  at: At,
  backward: Section<K, V>,
  forward: Section<K, V>,
) => {
  const offset = (row: Row<K, V>) => (at.fraction ?? ZERO) * row.primaryExtent;

  let row = forward.find(at.description);
  if (row) {
    return backward.primaryExtent + row.from - offset(row);
  }

  row = backward.find(at.description);
  if (row) {
    return backward.primaryExtent - row.from - row.primaryExtent - offset(row);
  }

  return undefined;
};

/**
 * Resolves the scroll `top` value the grid should target for the current render pass.
 *
 * When `at` is set and the item is found in either section, the position is
 * computed from the item's row rather than the current `scrollTop`. This is how
 * scroll-restore and programmatic focus scrolling work.
 *
 * @param at - Optional target item and its fractional position within its row.
 * @param backward - The backward section, searched second when `at` is set.
 * @param forward - The forward section, searched first when `at` is set.
 * @param offset - Pending scroll adjustment (px) from a section swap, or `false` if none.
 * @param scrollTop - Current `element.scrollTop`.
 * @returns The resolved scroll target in pixels.
 */
export const findTop = <K, V>({
  at,
  backward,
  offset,
  forward,
  scrollTop,
}: {
  at: At;
  backward: Section<K, V>;
  offset: number | false;
  forward: Section<K, V>;
  scrollTop: number;
}) => {
  const top = scrollTop - (offset === false ? ZERO : offset);
  return (at && anchorPosition(at, backward, forward)) ?? top;
};

/**
 * Builds a {@link RowChange} event for the topmost visible row if the scroll
 * position has changed or an `at` target is set.
 *
 * Picks the row with the smallest `delta` (closest to the viewport top) across
 * both sections, then looks up its pagination key from `keys`.
 *
 * @param at - The current scroll-restore target; when absent and `dispatchOffset`
 *   is false, no event is emitted.
 * @param dispatchOffset - When `true`, always emit even without an `at` target.
 * @param keys - Map from item ID to its pagination cursor.
 * @param matches - The closest visible row from each section.
 * @returns A {@link RowChange} event, or `undefined` if none should be dispatched.
 */
export const handleRowChange = <K, V>({
  at,
  dispatchOffset,
  keys,
  matches: { backward, forward },
}: {
  at: At;
  dispatchOffset?: boolean;
  keys: WeakMap<ID, K>;
  matches: Matches<K, V>;
}) => {
  if (!dispatchOffset && !at) {
    return null;
  }
  let match = forward;
  if (backward && (!match || backward.delta < match.delta)) {
    match = backward;
  }

  const item = match?.row.first;
  if (!keys.has(item)) {
    return null;
  }

  return new RowChange(
    item,
    keys.get(item),
    Math.abs(match.delta) / match.row.primaryExtent,
  );
};

/** Converts a pixel number to a CSS `px` string. */
export const pixels = (pixels: number) => `${pixels}px`;

/**
 * Imperatively scrolls the container to the position indicated by `at` or `offset`.
 *
 * When `at` is set, searches forward then backward sections for the target item
 * and scrolls directly to it. Otherwise applies the pending `offset` correction.
 *
 * @param at - Optional target item to scroll to.
 * @param backward - The backward section.
 * @param el - The scrollable container element.
 * @param forward - The forward section.
 * @param offset - Pending scroll adjustment from a section swap, or `false` if none.
 * @param top - Pre-computed scroll target from {@link findTop}.
 */
export const scrollToPosition = <K, V>({
  at,
  horizontal,
  backward,
  offset,
  el,
  forward,
  top,
}: {
  at: At;
  horizontal?: boolean;
  backward: Section<K, V>;
  el: HTMLDivElement;
  forward: Section<K, V>;
  offset: number | false;
  top: number;
}) => {
  const { scrollTo } = createAxis(horizontal);
  if (at) {
    const position = anchorPosition(at, backward, forward);
    position !== undefined && scrollTo(el, position);
    return;
  }

  if (offset !== false && top) {
    scrollTo(el, top);
  }
};

/** Sums an array of numbers. */
export const sum = (values: number[]) =>
  values.reduce((sum, next) => sum + next, 0);
