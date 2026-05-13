/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import { createAxis } from "./axis";
import type { Axis } from "./axis";
import { closest } from "./closest";
import {
  DATA_CY,
  DATA_CY_SECTION,
  DIRECTION,
  DIV,
  FIRST,
  LAST,
  ONE,
  SLOW_DOWN,
  TWO,
  ZERO,
} from "./constants";
import type Spotlight from "./index";
import Iter from "./iter";
import Row from "./row";
import tile from "./tile";
import type {
  Edge,
  ID,
  ItemData,
  Measure,
  Request,
  SpotlightConfig,
  Updater,
} from "./types";
import { create } from "./utilities";

/**
 * Callback supplied by {@link Spotlight} to a Section that applies the result
 * of a page load to the DOM. `run` tiles the new rows; the renderer decides
 * *when* to call it (e.g. deferred to the next rAF).
 */
export type Renderer<K, V> = (
  run: () => { section: Section<K, V>; offset: number }
) => void;

/**
 * Returns the section opposite to the caller's current section.
 * When `apply` is `true`, the caller should update its own section reference
 * to the returned value (used by {@link IterImpl} after crossing a boundary).
 */
export type Sibling<K, V> = (apply: boolean) => Section<K, V>;

/**
 * One of the two bounded sliding windows that make up the grid.
 *
 * A Section grows in one direction (forward = downward, backward = upward) as
 * the user scrolls. When it accumulates more than `maxRows / 2` rows it creates
 * a new Section for the overflow, reverses its own direction, and returns the new
 * Section to the caller via the {@link Renderer}. This keeps memory bounded while
 * supporting infinite scroll in both directions.
 */
export default class Section<K, V> {
  readonly #axis: Axis;
  readonly #config: SpotlightConfig<K, V>;
  readonly #container = create(DIV);
  readonly #section = create(DIV);
  readonly #crossExtent: number;

  #direction: DIRECTION;
  /** Cursor and remainder items at the leading edge; `undefined` while a fetch is in-flight. */
  #end: Edge<K, V>;
  #itemIds = new Set<string>();
  /** Maps each item ID to the next item ID in the forward direction. */
  #nextMap: WeakMap<ID, ID> = new WeakMap();
  /** Maps each item ID to the previous item ID in the forward direction. */
  #previousMap: WeakMap<ID, ID> = new WeakMap();
  #shown: Set<Row<K, V>> = new Set();
  /** Cursor and remainder items at the trailing edge; set after the first page load. */
  #start: Edge<K, V>;
  #rows: Row<K, V>[] = [];

  /**
   * @param config - Shared grid configuration.
   * @param direction - Initial scroll direction for this section.
   * @param edge - Starting cursor and any remainder items carried over from a sibling section.
   * @param width - Container width (px) used for layout.
   */
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
    this.#axis = createAxis(config.horizontal);
    this.#config = config;
    this.#direction = direction;
    this.#end = edge;
    this.#crossExtent = width;

    this.#container.classList.add(styles.spotlightContainer);
    this.#container.setAttribute(DATA_CY, DATA_CY_SECTION[this.#direction]);
    // set the fixed cross dimension once; the primary dimension is updated each render pass
    this.#container.style[this.#axis.crossSizeAttr] = `${this.#crossExtent}px`;

    this.#section.classList.add(styles.spotlightSection);
    this.#section.classList.add(direction);
    if (config.horizontal) {
      this.#section.classList.add(styles.horizontal);
    }
    this.#section.append(...[create(DIV), this.#container, create(DIV)]);
  }

  /** Current scroll direction of this section. */
  get direction() {
    return this.#direction;
  }

  /** `true` when the leading edge cursor is `null`, meaning no more pages exist in this direction. */
  get finished() {
    return this.#end?.key === null;
  }

  /** Total pixel height of all rows in this section. */
  get primaryExtent() {
    return this.#primaryExtent;
  }

  /** Number of rows currently held by this section. */
  get length() {
    return this.#rows.length;
  }

  /** `true` when no fetch is in-flight and the section can accept another page load. */
  get ready() {
    return Boolean(this.#end);
  }

  /** Sets the position of the section wrapper along the scroll axis. */
  set top(top: number) {
    this.#section.style[this.#axis.startAttr] = `${top}px`;
  }

  /**
   * Inserts the section wrapper into `element`. Backward sections are prepended
   * so they appear above the forward section.
   * @param element - The spotlight scroll container.
   */
  attach(element: HTMLDivElement) {
    this.#direction === DIRECTION.BACKWARD
      ? element.prepend(this.#section)
      : element.appendChild(this.#section);
  }

  /** Removes the section from the DOM and destroys all its rows. */
  destroy() {
    this.#section.remove();
    for (const row of this.#rows) row.destroy();
    this.#rows = [];
  }

  /**
   * Returns the first row that contains the item with the given description, or `null`.
   * @param item - The `ID.description` to search for.
   */
  find(item: string): Row<K, V> | null {
    for (const row of this.#rows) {
      if (row.has(item)) {
        return row;
      }
    }

    return null;
  }

  /**
   * Shows rows within the current viewport window and hides rows that have scrolled out.
   * Returns the closest visible row (for `rowchange` dispatch) and whether more data is needed.
   *
   * @param measure - Optional byte-size tracker passed through to each {@link Row.show}.
   * @param spotlight - The owning {@link Spotlight} instance.
   * @param target - The scroll position (px) used to find the closest row via binary search.
   * @param threshold - Returns `true` for rows that are within the render buffer.
   * @param top - Pixel offset applied when positioning rows.
   * @param zooming - `true` while the user is fast-scrolling.
   * @returns `{ match, more }` — the closest visible row with its delta, and whether to load more.
   */
  render({
    measure,
    spotlight,
    target,
    threshold,
    top,
    zooming,
  }: {
    measure?: Measure<K, V>;
    spotlight: Spotlight<K, V>;
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
      this.#direction === DIRECTION.BACKWARD ? this.primaryExtent - target : target,
      (row) => row.from + row.primaryExtent
    );

    let pageRow: Row<K, V>;
    let delta: number;

    const minus =
      this.#direction === DIRECTION.FORWARD
        ? (row) => row.from - top + this.#config.offset
        : (row) =>
            this.#primaryExtent - row.from - top + this.#config.offset - row.primaryExtent;

    if (match) {
      index = match.index;
      while (this.#rows[index]) {
        const row = this.#rows[index];

        if (!row) {
          break;
        }

        const current =
          this.#direction === DIRECTION.BACKWARD
            ? this.primaryExtent - row.from
            : row.from;

        if (!threshold(current)) {
          break;
        }

        row.show({
          attr:
            this.#direction === DIRECTION.FORWARD
              ? this.#axis.startAttr
              : this.#axis.endAttr,
          element: this.#container,
          measure,
          spotlight,
          zooming,
        });

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

    for (const row of hide) row.hide();

    if (
      index >= this.#rows.length - ONE &&
      this.#end &&
      this.#end.key !== null
    ) {
      requestMore = true;
    }

    this.#container.style[this.#axis.primarySizeAttr] = `${this.primaryExtent}px`;
    return {
      match: pageRow ? { row: pageRow, delta } : undefined,
      more: requestMore && this.ready,
    };
  }

  /** Calls `updater` for every item in the currently visible rows. */
  updateItems(updater: (id: ID) => void) {
    for (const row of this.#shown) row.updateItems(updater);
  }

  /**
   * Ensures at least one row is loaded, then returns the ID of the
   * first item in the section (direction-aware: last item of first row for backward).
   * Used by {@link IterImpl} when crossing a section boundary.
   *
   * @param request - Fetches the next page if the section has no rows yet.
   * @param renderer - Applied to new rows after fetching.
   * @param sibling - Passed through to {@link next} if a fetch is required.
   */
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

  /**
   * Returns the item after `id` in the forward direction.
   * If the item is at the end of this section's loaded rows, tries to load more.
   * Throws the sibling section if this section cannot provide a next item.
   *
   * @param id - The current item ID.
   * @param request - Fetches additional pages as needed.
   * @param renderer - Applied to newly loaded rows.
   * @param sibling - Thrown (as the sibling Section) when the iterator must cross to the other section.
   */
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

  /**
   * Returns the item before `id` in the forward direction.
   * If the item is at the start of this section's loaded rows, tries to load more.
   * Throws the sibling section if this section cannot provide a previous item.
   *
   * @param id - The current item ID.
   * @param request - Fetches additional pages as needed.
   * @param renderer - Applied to newly loaded rows.
   * @param sibling - Thrown (as the sibling Section) when the iterator must cross to the other section.
   */
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

  /**
   * Fetches the next page, tiles it into rows, and calls `renderer` to apply them.
   *
   * When the section reaches `maxRows / 2` rows, it creates a new Section for the
   * overflow, reverses its own direction, and returns the new Section via the renderer
   * callback so the caller can swap it in.
   *
   * @param request - Fetches a page using the current leading-edge cursor.
   * @param renderer - Receives a runner that tiles and appends rows; deferred to rAF by the caller.
   * @param sibling - Passed through to `#tile` so newly created rows get a valid iterator.
   * @returns `true` if a fetch was initiated, `false` if the section is already exhausted.
   * @throws {@link SLOW_DOWN} if called while a previous fetch is still in-flight.
   */
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
        this.#primaryExtent,
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
        (acc, cur) => acc + cur.primaryExtent + this.#config.spacing,
        ZERO
      );

      if (this.#rows.length < this.#maxRows) {
        this.#end = newEnd;
        return { section: null, offset: height };
      }

      const section = new Section({
        config: this.#config,
        direction: this.#direction,
        edge: newEnd,
        width: this.#crossExtent,
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

  /** Total height of all rows including inter-row spacing. */
  get #primaryExtent() {
    if (!this.#rows.length) return ZERO;
    const row = this.#rows[this.length - ONE];
    return row.from + row.primaryExtent;
  }

  /** Half of `maxRows` — the per-section row limit before a section swap is triggered. */
  get #maxRows() {
    return Math.floor(this.#config.maxRows / TWO);
  }

  /**
   * Reverses the row order and flips the section direction.
   * Called during a section swap so the current section becomes the trailing section
   * in the opposite direction while the new section takes over the leading role.
   */
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
      offset += this.#config.spacing + row.primaryExtent;
      row.switch(
        this.#direction === DIRECTION.BACKWARD
          ? this.#axis.endAttr
          : this.#axis.startAttr
      );
    }

    this.#section.classList.remove(old);
    this.#section.classList.add(this.#direction);
    this.#container.setAttribute(DATA_CY, DATA_CY_SECTION[this.#direction]);
  }

  /**
   * Runs the tiling algorithm over `items`, creates {@link Row} instances, and
   * links each item into `#nextMap` / `#previousMap` for iteration.
   *
   * @param items - Items to lay out, already filtered for duplicates.
   * @param from - Starting vertical offset (px) for the first new row.
   * @param useRemainder - Whether to include a partial final row.
   * @param focus - Focus function passed to each Row for click handling.
   * @param request - Passed through to each Row's Iter.
   * @param renderer - Passed through to each Row's Iter.
   * @param sibling - Passed through to each Row's Iter.
   * @param finished - `true` when this is the last page; enables dangle-row sizing.
   * @returns The new rows, any leftover items that didn't fit, and the total added height.
   */
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
    const threshold = this.#config.rowAspectRatioThreshold(this.#crossExtent);

    const breakpoints =
      threshold === ZERO
        ? items.map((_, i) => i + 1)
        : tile(
            items.map(({ aspectRatio }) => this.#axis.tilingAR(aspectRatio)),
            threshold,
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
        width: this.#crossExtent,
      });
      rows.push(row);
      offset += row.primaryExtent + this.#config.spacing;
      previous = breakpoints[index];
    }

    const remainder = items.slice(breakpoints[breakpoints.length - ONE]);

    return { rows, remainder, offset };
  }
}
