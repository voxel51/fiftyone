/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

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

export const create = <K extends keyof HTMLElementTagNameMap>(
  tagName: K
): HTMLElementTagNameMap[K] => {
  return document.createElement(tagName);
};

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
  let top = scrollTop - (offset === false ? ZERO : offset);
  if (at) {
    const row = forward.find(at.description);
    if (row) {
      top = backward.height + row.from - at.offset;
    }
  }
  return top;
};

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
    return;
  }
  let item = forward?.row.first;
  let delta = forward?.delta;

  if (backward && (!item || backward.delta < delta)) {
    item = backward.row.first;
    delta = backward.delta;
  }

  if (!keys.has(item)) {
    return;
  }

  return new RowChange(item, keys.get(item), Math.abs(delta));
};

export const pixels = (pixels: number) => `${pixels}px`;

export const scrollToPosition = <K, V>({
  at,
  backward,
  offset,
  el,
  forward,
  top,
}: {
  at: At;
  backward: Section<K, V>;
  el: HTMLDivElement;
  forward: Section<K, V>;
  offset: number | false;
  top: number;
}) => {
  if (at) {
    let row = forward.find(at.description);
    if (row) {
      el.scrollTo(ZERO, backward.height + row.from - at.offset);
      return;
    }

    row = backward.find(at.description);
    row && el.scrollTo(ZERO, backward.height - row.from - row.height);
    return;
  }

  if (offset !== false && top) {
    el.scrollTo(ZERO, top);
  }
};

export const sum = (values: number[]) =>
  values.reduce((sum, next) => sum + next, 0);
