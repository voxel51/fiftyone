/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import type { ItemData, Render } from "./row";

import { closest } from "./closest";
import { MARGIN } from "./constants";
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
  #shown: Set<Row<V>> = new Set();

  readonly #container = document.createElement("div");
  readonly #section = document.createElement("div");
  #start: Edge<K, V>;
  #direction: "forward" | "backward";
  #end: Edge<K, V>;
  #rows: Row<V>[] = [];
  constructor(
    edge: Edge<K, V> | undefined,
    direction: "forward" | "backward",
    readonly threshold: number,
    readonly width: number
  ) {
    this.#end = edge;
    this.#direction = direction;
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
    return this.#height + (this.#direction === "backward" ? 48 : 0);
  }

  get #height() {
    if (!this.#rows.length) return this.#direction === "backward" ? MARGIN : 0;

    const row = this.#rows[this.length - 1];

    return row.from + row.height + MARGIN;
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

      const height = rows.reduce((acc, cur) => acc + cur.height + MARGIN, 0);

      if (this.#rows.length < 40) {
        this.#end = newEnd;
        return { section: null, offset: height };
      }

      const section = new Section(
        newEnd,
        this.#direction,
        this.threshold,
        this.width
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

    let index = -1;

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

        if (d < 0) {
          continue;
        }
        if (delta === undefined || d < delta) {
          pageRow = row;
          delta = d;
        }
      }
    }

    if (index >= this.#rows.length - 1 && this.#end?.key !== undefined) {
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
    const from = this.#height - (this.#direction === "forward" ? MARGIN : 0);
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
    const breakpoints = tile(data, this.threshold, useRemainder);

    let previous = 0;
    let offset = 0;
    const rows: Row<V>[] = [];
    for (let index = 0; index < breakpoints.length; index++) {
      const rowItems = items.slice(previous, breakpoints[index]);

      this.#direction === "backward" && rowItems.reverse();

      const row = new Row(rowItems, from + offset, this.width);
      rows.push(row);
      offset += row.height + MARGIN;
      previous = breakpoints[index];
    }

    const remainder = items.slice(breakpoints[breakpoints.length - 1]);

    return { rows, remainder, offset };
  }
}
