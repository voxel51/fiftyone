/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import type {
  Edge,
  ID,
  ItemData,
  Request,
  SpotlightConfig,
  Updater,
} from "./types";

import { closest } from "./closest";
import {
  BOTTOM,
  DATA_CY,
  DATA_CY_SECTION,
  DIRECTION,
  DIV,
  FIRST,
  LAST,
  ONE,
  SECTION_ROW_LIMIT,
  SLOW_DOWN,
  TOP,
  ZERO,
} from "./constants";
import Iter from "./iter";
import Row from "./row";
import tile from "./tile";
import { create } from "./utilities";

export type Renderer<K, V> = (
  run: () => { section: Section<K, V>; offset: number }
) => void;
export type Sibling<K, V> = (apply: boolean) => Section<K, V>;

export default class Section<K, V> {
  readonly #config: SpotlightConfig<K, V>;
  readonly #container = create(DIV);
  readonly #section = create(DIV);
  readonly #width: number;

  #direction: DIRECTION;
  #end: Edge<K, V>;
  #itemIds = new Set<string>();
  #nextMap: WeakMap<ID, ID> = new WeakMap();
  #previousMap: WeakMap<ID, ID> = new WeakMap();
  #shown: Set<Row<K, V>> = new Set();
  #start: Edge<K, V>;
  #rows: Row<K, V>[] = [];

  constructor({
    config,
    direction,
    edge,
    width,
  }: {
    at?: string;
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
    this.#container.setAttribute(DATA_CY, DATA_CY_SECTION[this.#direction]);

    this.#section.classList.add(styles.spotlightSection);
    this.#section.classList.add(direction);
    this.#section.append(...[create(DIV), this.#container, create(DIV)]);
  }

  get direction() {
    return this.#direction;
  }

  get finished() {
    return this.#end?.key === null;
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

  destroy(destroyItems = false) {
    this.#section.remove();
    for (const row of this.#rows) row.destroy(destroyItems);
    this.#rows = [];
  }

  find(item: string): Row<K, V> | null {
    for (const row of this.#rows) {
      if (row.has(item)) {
        return row;
      }
    }

    return null;
  }

  render({
    config,
    target,
    threshold,
    top,
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
        return row.from + row.height;
      }
    );

    let pageRow: Row<K, V>;
    let delta: number;

    const minus =
      this.#direction === DIRECTION.FORWARD
        ? (row) => row.from - top + this.#config.offset
        : (row) =>
            this.#height - row.from - top + this.#config.offset - row.height;

    if (match) {
      index = match.index;
      while (this.#rows[index]) {
        const row = this.#rows[index];

        if (!row) {
          break;
        }

        const current =
          this.#direction === DIRECTION.BACKWARD
            ? this.height - row.from
            : row.from;

        if (!threshold(current)) {
          break;
        }

        row.show(
          this.#container,
          this.#direction === DIRECTION.FORWARD ? TOP : BOTTOM,
          zooming,
          config
        );

        this.#shown.add(row);
        hide.delete(row);
        index++;

        const d = minus(row);
        if (d >= ZERO && (delta === undefined || d < delta)) {
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
      match: pageRow ? { row: pageRow, delta } : undefined,
    };
  }

  updateItems(updater: (id: ID) => void) {
    for (const row of this.#shown) row.updateItems(updater);
  }

  async first(
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: Sibling<K, V>
  ) {
    if (!this.#rows.length) {
      await this.next(request, renderer, sibling);
    }

    if (!this.#rows.length) {
      return undefined;
    }

    return this.#direction === DIRECTION.BACKWARD
      ? this.#rows[ZERO].last
      : this.#rows[ZERO].first;
  }

  async iterNext(
    id: ID,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: Sibling<K, V>
  ) {
    const next = this.#nextMap.get(id);
    if (next) {
      return next;
    }

    if (this.#direction === DIRECTION.FORWARD) {
      await this.next(request, renderer, sibling);
      if (this.#direction === DIRECTION.FORWARD) {
        return this.#nextMap.get(id);
      }
    }

    throw await sibling(false);
  }

  async iterPrevious(
    id: ID,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: Sibling<K, V>
  ) {
    const previous = this.#previousMap.get(id);
    if (previous) {
      return previous;
    }

    if (this.#direction === DIRECTION.BACKWARD) {
      await this.next(request, renderer, sibling);
      if (this.#direction === DIRECTION.BACKWARD) {
        return this.#previousMap.get(id);
      }
    }

    throw await sibling(false);
  }

  async next(
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: Sibling<K, V>
  ) {
    const end = this.#end;
    if (!end) {
      // already requested, give up
      throw SLOW_DOWN;
    }

    if (end?.key === null && !end.remainder?.length) {
      return Boolean(end?.key === null);
    }

    this.#end = undefined;
    const data = await request(end.key);

    renderer(() => {
      const { rows, remainder } = this.#tile(
        [...end.remainder, ...data.items].filter(
          (i) => !this.#itemIds.has(i.id.description)
        ),
        this.#height,
        data.next === null,
        data.focus,
        request,
        renderer,
        sibling,
        data.next === null
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

    let offset = ZERO;
    for (const row of this.#rows) {
      row.from = offset;
      offset += this.#config.spacing + row.height;
      row.switch(this.#direction === DIRECTION.BACKWARD ? BOTTOM : TOP);
    }

    this.#section.classList.remove(old);
    this.#section.classList.add(this.#direction);
    this.#container.setAttribute(DATA_CY, DATA_CY_SECTION[this.#direction]);
  }

  #tile(
    items: ItemData<K, V>[],
    from: number,
    useRemainder: boolean,
    focus: (id?: ID) => ID,
    request: Request<K, V>,
    renderer: Renderer<K, V>,
    sibling: Sibling<K, V>,
    finished: boolean
  ): { rows: Row<K, V>[]; remainder: ItemData<K, V>[]; offset: number } {
    const data = items.map(({ aspectRatio }) => aspectRatio);

    const breakpoints = tile(
      data,
      this.#config.rowAspectRatioThreshold(this.#width),
      useRemainder
    );

    let offset = this.#rows.length ? this.#config.spacing : ZERO;
    let previous = ZERO;
    const rows: Row<K, V>[] = [];

    const chain = (
      first: ID | undefined,
      next: WeakMap<ID, ID>,
      previous: WeakMap<ID, ID>
    ) => {
      let last = first;
      return (id: ID) => {
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
      : this.#rows[this.#rows.length - ONE][
          this.#direction === DIRECTION.BACKWARD ? FIRST : LAST
        ];

    const link = chain(first, forward, backward);
    for (let index = ZERO; index < breakpoints.length; index++) {
      const rowItems = items.slice(previous, breakpoints[index]);
      for (const row of rowItems) link(row.id);

      if (this.#direction === DIRECTION.BACKWARD) {
        rowItems.reverse();
      }

      for (const i of rowItems) {
        this.#itemIds.add(i.id.description);
      }

      const row = new Row({
        config: this.#config,
        dangle:
          this.#direction === DIRECTION.FORWARD &&
          finished &&
          index === breakpoints.length - ONE,
        focus,
        from: from + offset,
        iter: new Iter(focus, request, renderer, this, sibling),
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
