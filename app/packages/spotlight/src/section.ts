/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import type {
  Edge,
  ItemData,
  Request,
  SpotlightConfig,
  Updater,
} from "./types";

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

type Renderer<K, V> = (
  run: () => { section: Section<K, V>; offset: number }
) => void;

export class Section<K, V> {
  readonly #config: SpotlightConfig<K, V>;
  readonly #container = create(DIV);
  readonly #section = create(DIV);
  readonly #width: number;

  #direction: DIRECTION;
  #dirty: Set<Row<K, V>> = new Set();
  #end: Edge<K, V>;
  #nextMap: WeakMap<symbol, symbol> = new WeakMap();
  #previousMap: WeakMap<symbol, symbol> = new WeakMap();
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

  async first(
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: () => Section<K, V>
  ) {
    if (!this.#rows.length) {
      await this.next(request, renderer, sibling);
    }

    if (!this.#rows.length) {
      return undefined;
    }

    return this.#direction === DIRECTION.BACKWARD
      ? this.#rows[0].last
      : this.#rows[0].first;
  }

  async next(
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: () => Section<K, V>
  ) {
    if (!this.#end || this.#end.key === null) {
      return Boolean(this.#end.key === null);
    }
    const end = this.#end;
    this.#end = undefined;

    const data = await request(end.key);

    renderer(() => {
      const { rows, remainder } = this.#tile(
        [...end.remainder, ...data.items],
        this.#height,
        Boolean(data.next),
        data.focus,
        request,
        renderer,
        sibling
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

  async #next(
    id: symbol,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: () => Section<K, V>
  ) {
    const next = this.#nextMap.get(id);
    if (next) {
      return next;
    }

    if (this.#direction === DIRECTION.FORWARD) {
      const result = await this.next(request, renderer, sibling);
      if (result) return this.#nextMap.get(id);
    } else {
      return await sibling().first(request, renderer, sibling);
    }

    return undefined;
  }
  async #previous(
    id: symbol,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: () => Section<K, V>
  ) {
    const previous = this.#previousMap.get(id);
    if (previous) {
      return previous;
    }

    if (this.#direction === DIRECTION.BACKWARD) {
      const result = await this.next(request, renderer, sibling);

      if (result) return this.#previousMap.get(id);
    } else {
      return await sibling().first(request, renderer, sibling);
    }

    return undefined;
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
    useRemainder: boolean,
    focus: (id?: symbol) => symbol,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: () => Section<K, V>
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

    const chain = (
      first: symbol,
      next: WeakMap<symbol, symbol>,
      previous: WeakMap<symbol, symbol>
    ) => {
      let last = first;

      return (id: symbol) => {
        if (last) {
          previous.set(id, last);
          next.set(last, id);
        }

        last = id;
      };
    };

    const forward =
      this.#direction === DIRECTION.BACKWARD
        ? this.#previousMap
        : this.#nextMap;
    const backward =
      this.#direction === DIRECTION.BACKWARD
        ? this.#nextMap
        : this.#previousMap;

    const first = !this.#rows.length
      ? undefined
      : this.#rows[this.#rows.length - 1][
          this.#direction === DIRECTION.BACKWARD ? "first" : "last"
        ];

    const link = chain(first, forward, backward);
    for (let index = ZERO; index < breakpoints.length; index++) {
      const rowItems = items.slice(previous, breakpoints[index]);
      for (const row of rowItems) link(row.id);

      if (this.#direction === DIRECTION.BACKWARD) {
        rowItems.reverse();
      }

      const row = new Row({
        config: this.#config,
        focus,
        from: from + offset,
        next: async (from: number) => {
          let answer = focus();
          const iter =
            from >= ZERO
              ? (id) => this.#next(id, request, renderer, sibling)
              : (id) => this.#previous(id, request, renderer, sibling);
          let current = Math.abs(from);
          while (current !== ZERO) {
            const result = await iter(answer);
            if (!result) {
              answer = undefined;
              break;
            }
            answer = result;
            current--;
          }

          answer && focus(answer);
          return answer;
        },
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
