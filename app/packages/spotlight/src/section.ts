/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import type { ItemData, Render } from "./row";

import { closest } from "./closest";
import { ONE, SECTION_ROW_LIMIT, ZERO } from "./constants";
import Row from "./row";
import tile from "./tile";

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
  readonly #container = document.createElement("div");
  readonly #offset: number;
  readonly #section = document.createElement("div");
  readonly #spacing: number;
  readonly #threshold: number;
  readonly #width: number;

  #direction: "forward" | "backward";
  #end: Edge<K, V>;
  #shown: Set<Row<V>> = new Set();
  #start: Edge<K, V>;
  #rows: Row<V>[] = [];

  constructor(
    edge: Edge<K, V> | undefined,
    direction: "forward" | "backward",
    offset: number,
    spacing: number,
    threshold: number,
    width: number
  ) {
    this.#direction = direction;
    this.#end = edge;
    this.#offset = offset;
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

  get length() {
    return this.#rows.length;
  }

  get height() {
    return (
      this.#height + (this.#direction === "backward" ? this.#offset : ZERO)
    );
  }

  get #height() {
    if (!this.#rows.length)
      return this.#direction === "backward" ? this.#spacing : ZERO;

    const row = this.#rows[this.length - ONE];

    return row.from + row.height + this.#spacing;
  }

  set top(top: number) {
    this.#section.style.top = `${top}px`;
  }

  attach(element: HTMLDivElement) {
    this.#direction === "backward"
      ? element.prepend(this.#section)
      : element.appendChild(this.#section);
  }

  remove() {
    this.#section.remove();
    this.#rows = [];
  }

  get ready() {
    return Boolean(this.#end);
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
        this.#offset,
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

  render(
    target: number,
    threshold: (n: number) => boolean,
    zooming: boolean,
    render: Render,
    top: number
  ) {
    const hide = this.#shown;
    this.#shown = new Set();

    let requestMore = false;

    let index = -ONE;

    const match = closest(
      this.#rows,
      this.#direction === "backward" ? this.height - target : target,
      (row) => {
        if (this.#direction === "backward") {
          return row.from + row.height;
        }
        return row.from;
      }
    );

    let pageRow = undefined;
    let delta = undefined;

    const minus =
      this.#direction === "forward"
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
          this.#direction === "backward"
            ? this.height - row.from - row.height
            : row.from;

        if (!threshold(current)) {
          break;
        }

        const d = minus(row.from);

        row.show(
          this.#container,
          false,
          this.#direction === "forward" ? "top" : "bottom",
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

  #reverse() {
    const from =
      this.#height - (this.#direction === "forward" ? this.#spacing : ZERO);
    this.#rows.reverse();
    const old = this.#direction;
    this.#direction = this.#direction === "backward" ? "forward" : "backward";

    for (const row of this.#rows) {
      row.from = from - row.from - row.height;
      row.switch(this.#direction === "backward" ? "bottom" : "top");
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

      this.#direction === "backward" && rowItems.reverse();

      const row = new Row(from + offset, rowItems, this.#spacing, this.#width);
      rows.push(row);
      offset += row.height + this.#spacing;
      previous = breakpoints[index];
    }

    const remainder = items.slice(breakpoints[breakpoints.length - ONE]);

    return { rows, remainder, offset };
  }
}
