/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import type { ItemData, Render } from "./row";
import type { Updater } from "./types";

import { closest } from "./closest";
import {
  BOTTOM,
  DIRECTION,
  DIV,
  ONE,
  SECTION_ROW_LIMIT,
  TOP,
  ZERO,
} from "./constants";
import Row from "./row";
import tile from "./tile";
import { create } from "./utilities";

export interface Response<K, V> {
  items: ItemData<V>[];
  next: K | null;
  previous: K | null;
}

interface Edge<K, V> {
  key?: K;
  remainder?: ItemData<V>[];
}

export class Section<K, V> {
  readonly #container = create(DIV);
  readonly #section = create(DIV);
  readonly #spacing: number;
  readonly #threshold: number;
  readonly #width: number;

  #direction: DIRECTION;
  #dirty: Set<Row<V>> = new Set();
  #end: Edge<K, V>;
  #shown: Set<Row<V>> = new Set();
  #start: Edge<K, V>;
  #rows: Row<V>[] = [];

  constructor(
    edge: Edge<K, V> | undefined,
    direction: DIRECTION,
    spacing: number,
    threshold: number,
    width: number
  ) {
    this.#direction = direction;
    this.#end = edge;
    this.#spacing = spacing;
    this.#threshold = threshold;
    this.#width = width;

    this.#container.classList.add(styles.spotlightContainer);

    this.#section.classList.add(styles.spotlightSection);
    this.#section.appendChild(this.#container);
    this.#section.classList.add(direction);
  }

  get finished() {
    return Boolean(this.#end && !this.#end.key);
  }

  get height() {
    return this.#height;
  }

  get length() {
    return this.#rows.length;
  }

  get ready() {
    return Boolean(this.#end);
  }

  set top(top: number) {
    this.#section.style.top = `${top}px`;
  }

  attach(element: HTMLDivElement) {
    this.#direction === DIRECTION.BACKWARD
      ? element.prepend(this.#section)
      : element.appendChild(this.#section);
  }

  remove() {
    this.#section.remove();
    this.#rows = [];
  }

  render({
    render,
    target,
    threshold,
    top,
    updater,
    zooming,
  }: {
    render: Render;
    target: number;
    threshold: (n: number) => boolean;
    top: number;
    updater: Updater;
    zooming: boolean;
  }) {
    const hide = this.#shown;
    this.#shown = new Set();

    let requestMore = false;

    let index = -ONE;

    const match = closest(
      this.#rows,
      this.#direction === DIRECTION.BACKWARD ? this.height - target : target,
      (row) => {
        if (this.#direction === DIRECTION.BACKWARD) {
          return row.from + row.height;
        }
        return row.from;
      }
    );

    let pageRow = undefined;
    let delta = undefined;

    const minus =
      this.#direction === DIRECTION.FORWARD
        ? (from) => from - top
        : (from) => this.#height - from - top;

    if (match) {
      index = match.index;
      while (this.#rows[index]) {
        const row = this.#rows[index];

        if (!row) {
          break;
        }

        const current =
          this.#direction === DIRECTION.BACKWARD
            ? this.height - row.from - row.height
            : row.from;

        if (!threshold(current)) {
          break;
        }
        if (this.#dirty.has(row) && !zooming && updater) {
          row.updateItems(updater);
          this.#dirty.delete(row);
        }

        const d = minus(row.from);
        row.show(
          this.#container,
          this.#dirty.has(row) && zooming,
          this.#direction === DIRECTION.FORWARD ? TOP : BOTTOM,
          zooming,
          render
        );

        this.#shown.add(row);
        hide.delete(row);
        index++;

        if (d < ZERO) {
          continue;
        }

        if (delta === undefined || d < delta) {
          pageRow = row;
          delta = d;
        }
      }
    }

    if (index >= this.#rows.length - ONE && this.#end?.key !== undefined) {
      requestMore = true;
    }

    for (const row of hide) row.hide();

    this.#container.style.height = `${this.height}px`;

    return {
      more: requestMore && this.ready,
      match: { row: pageRow, delta },
    };
  }

  updateItems(updater: (id: symbol) => void) {
    for (const row of this.#shown) row.updateItems(updater);
    for (const row of this.#rows) !this.#shown.has(row) && this.#dirty.add(row);
  }

  async next(
    get: (key: K) => Promise<{ next?: K; previous?: K; items: ItemData<V>[] }>,
    render: (run: () => { section: Section<K, V>; offset: number }) => void
  ) {
    if (!this.#end) {
      return;
    }
    const end = this.#end;
    this.#end = undefined;

    const data = await get(end.key);

    render(() => {
      const { rows, remainder } = this.#tile(
        [...end.remainder, ...data.items],
        this.#height,
        Boolean(data.next)
      );

      if (!this.#start) {
        this.#start = {
          key: data.previous,
          remainder: [],
        };
      }

      const newEnd =
        data.next !== null
          ? {
              key: data.next,
              remainder,
            }
          : {};
      this.#rows.push(...rows);

      const height = rows.reduce(
        (acc, cur) => acc + cur.height + this.#spacing,
        ZERO
      );

      if (this.#rows.length < SECTION_ROW_LIMIT) {
        this.#end = newEnd;
        return { section: null, offset: height };
      }

      const section = new Section(
        newEnd,
        this.#direction,
        this.#spacing,
        this.#threshold,
        this.#width
      );
      this.#end = this.#start;
      this.#start = newEnd;

      this.#reverse();

      return { section, offset: height };
    });
  }

  get #height() {
    if (!this.#rows.length) return ZERO;
    const row = this.#rows[this.length - ONE];
    return row.from + row.height + this.#spacing;
  }

  #reverse() {
    const from =
      this.#height -
      (this.#direction === DIRECTION.FORWARD ? this.#spacing : ZERO);
    this.#rows.reverse();
    const old = this.#direction;
    this.#direction =
      this.#direction === DIRECTION.BACKWARD
        ? DIRECTION.FORWARD
        : DIRECTION.BACKWARD;

    for (const row of this.#rows) {
      row.from = from - row.from - row.height;
      row.switch(this.#direction === DIRECTION.BACKWARD ? BOTTOM : TOP);
    }

    this.#section.classList.remove(old);

    this.#section.classList.add(this.#direction);
  }

  #tile(
    items: ItemData<V>[],
    from: number,
    useRemainder: boolean
  ): { rows: Row<V>[]; remainder: ItemData<V>[]; offset: number } {
    const data = items.map(({ aspectRatio }) => aspectRatio);
    const breakpoints = tile(data, this.#threshold, useRemainder);

    let previous = ZERO;
    let offset = ZERO;
    const rows: Row<V>[] = [];
    for (let index = ZERO; index < breakpoints.length; index++) {
      const rowItems = items.slice(previous, breakpoints[index]);

      this.#direction === DIRECTION.BACKWARD && rowItems.reverse();

      const row = new Row(from + offset, rowItems, this.#spacing, this.#width);
      rows.push(row);
      offset += row.height + this.#spacing;
      previous = breakpoints[index];
    }

    const remainder = items.slice(breakpoints[breakpoints.length - ONE]);

    return { rows, remainder, offset };
  }
}
