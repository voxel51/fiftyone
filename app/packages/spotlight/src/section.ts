/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import Row from "./row";
import type { Edge, ItemData, SpotlightConfig, Updater } from "./types";

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
import tile from "./tile";
import { create } from "./utilities";

export class Section<K, V> {
  readonly #config: SpotlightConfig<K, V>;
  readonly #container = create(DIV);
  readonly #section = create(DIV);
  readonly #width: number;

  #direction: DIRECTION;
  #dirty: Set<Row<K, V>> = new Set();
  #end: Edge<K, V>;
  #shown: Set<Row<K, V>> = new Set();
  #start: Edge<K, V>;
  #rows: Row<K, V>[] = [];

  constructor({
    config,
    direction,
    edge,
    width,
  }: {
    config: SpotlightConfig<K, V>;
    direction: DIRECTION;
    edge: Edge<K, V>;
    width: number;
  }) {
    this.#config = config;
    this.#direction = direction;
    this.#end = edge;
    this.#width = width;

    this.#container.classList.add(styles.spotlightContainer);

    this.#section.classList.add(styles.spotlightSection);
    this.#section.appendChild(this.#container);
    this.#section.classList.add(direction);
  }

  get finished() {
    return Boolean(this.#end && this.#end.key === null);
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
    config,
    target,
    threshold,
    top,
    updater,
    zooming,
  }: {
    config: SpotlightConfig<K, V>;
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

    let pageRow: Row<K, V>;
    let delta: number;

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
          config
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

    if (
      index >= this.#rows.length - ONE &&
      this.#end &&
      this.#end.key !== null
    ) {
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
    get: (
      key: K
    ) => Promise<{ next?: K; previous?: K; items: ItemData<K, V>[] }>,
    render: (run: () => { section: Section<K, V>; offset: number }) => void
  ) {
    if (!this.#end || this.#end.key === null) {
      return Boolean(this.#end.key === null);
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
          key: data.previous ?? null,
          remainder: [],
        };
      }

      const newEnd =
        data.next !== null
          ? {
              key: data.next,
              remainder,
            }
          : { key: null };
      this.#rows.push(...rows);

      const height = rows.reduce(
        (acc, cur) => acc + cur.height + this.#config.spacing,
        ZERO
      );

      if (this.#rows.length < SECTION_ROW_LIMIT) {
        this.#end = newEnd;
        return { section: null, offset: height };
      }

      const section = new Section({
        config: this.#config,
        direction: this.#direction,
        edge: newEnd,
        width: this.#width,
      });
      this.#end = this.#start;
      this.#start = newEnd;

      this.#reverse();

      return {
        section,
        offset: height,
      };
    });

    return true;
  }

  get #height() {
    if (!this.#rows.length) return ZERO;
    const row = this.#rows[this.length - ONE];
    return row.from + row.height;
  }

  #reverse() {
    this.#rows.reverse();
    const old = this.#direction;
    this.#direction =
      this.#direction === DIRECTION.BACKWARD
        ? DIRECTION.FORWARD
        : DIRECTION.BACKWARD;

    let offset = 0;
    for (const row of this.#rows) {
      row.from = offset;
      offset += this.#config.spacing + row.height;
      row.switch(this.#direction === DIRECTION.BACKWARD ? BOTTOM : TOP);
    }

    this.#section.classList.remove(old);
    this.#section.classList.add(this.#direction);
  }

  #tile(
    items: ItemData<K, V>[],
    from: number,
    useRemainder: boolean
  ): { rows: Row<K, V>[]; remainder: ItemData<K, V>[]; offset: number } {
    const data = items.map(({ aspectRatio }) => aspectRatio);
    const breakpoints = tile(
      data,
      this.#config.rowAspectRatioThreshold,
      useRemainder
    );

    let offset = this.#rows.length ? this.#config.spacing : ZERO;
    let previous = ZERO;
    const rows: Row<K, V>[] = [];
    for (let index = ZERO; index < breakpoints.length; index++) {
      const rowItems = items.slice(previous, breakpoints[index]);

      this.#direction === DIRECTION.BACKWARD && rowItems.reverse();

      const row = new Row({
        config: this.#config,
        from: from + offset,
        items: rowItems,
        width: this.#width,
      });
      rows.push(row);
      offset += row.height + this.#config.spacing;
      previous = breakpoints[index];
    }

    const remainder = items.slice(breakpoints[breakpoints.length - ONE]);

    return { rows, remainder, offset };
  }
}
