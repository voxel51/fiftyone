/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import "@af-utils/scrollend-polyfill";

import styles from "./styles.module.css";

import {
  DEFAULT_MAX_ROWS,
  DEFAULT_OFFSET,
  DEFAULT_SPACING,
  DIRECTION,
  DIV,
  MIN_ASPECT_RATIO_RECOMMENDATION,
  ONE,
  SCROLLBAR_WIDTH,
  THREE,
  TWO,
  ZERO,
  ZOOMING_COEFFICIENT,
} from "./constants";
import createScrollReader from "./createScrollReader";
import type { EventCallback, RowChange } from "./events";
import { Load, Rejected } from "./events";
import IterImpl from "./iter";
import type { Renderer, Sibling } from "./section";
import Section from "./section";
import tile from "./tile";
import type {
  At,
  ID,
  ItemData,
  Iter,
  Measure,
  Request,
  Response,
  SpotlightConfig,
  Updater,
} from "./types";
import {
  create,
  findTop,
  handleRowChange,
  scrollToPosition,
  sum,
} from "./utilities";

export { Load, Rejected, RowChange } from "./events";
export * from "./types";

/**
 * A cursor-based, justified-layout virtualized grid for rendering large collections of items.
 *
 * Items are laid out in rows whose heights are determined by a target aspect ratio, and only
 * the rows near the viewport are rendered at any given time. Two internal {@link Section}
 * instances — forward and backward — are swapped as the user scrolls to keep memory bounded.
 *
 * @typeParam K - Pagination cursor type passed to {@link SpotlightConfig.get}.
 * @typeParam V - Arbitrary per-item payload type stored in {@link ItemData.data}.
 *
 * @example
 * ```ts
 * const spotlight = new Spotlight({ key: initialCursor, get, showItem, hideItem, detachItem, rowAspectRatioThreshold });
 * spotlight.addEventListener("load", () => console.log("ready"));
 * spotlight.attach("container-id");
 * ```
 */
export default class Spotlight<K, V> extends EventTarget {
  readonly #aborter = new AbortController();
  readonly #config: SpotlightConfig<K, V>;
  readonly #element = create(DIV);
  readonly #keys = new WeakMap<ID, K>();

  #backward: Section<K, V>;
  #focused?: ID;
  #forward: Section<K, V>;
  #loaded = false;
  #rect?: DOMRect;
  #rejected = false;
  #scrollReader?: ReturnType<typeof createScrollReader>;
  #updater?: Updater;
  #validate?: (key: string, add: number) => void;

  /**
   * @param config - Grid configuration. `maxRows`, `offset`, and `spacing` default to {@link DEFAULT_MAX_ROWS}, {@link DEFAULT_OFFSET}, and {@link DEFAULT_SPACING} respectively.
   */
  constructor(config: SpotlightConfig<K, V>) {
    super();
    this.#config = {
      maxRows: DEFAULT_MAX_ROWS,
      offset: DEFAULT_OFFSET,
      spacing: DEFAULT_SPACING,
      ...config,
    };
    this.#element.classList.add(styles.spotlight);
    this.#config.scrollbar && this.#element.classList.add(styles.scrollbar);
  }

  /** True when the spotlight element is mounted in the DOM. */
  get attached() {
    return Boolean(this.#element.parentElement);
  }

  /** True after the initial fill has completed and a `load` event has fired. */
  get loaded() {
    return this.#loaded;
  }

  addEventListener(type: "load", callback: EventCallback<Load<K>>): void;
  addEventListener(type: "rejected", callback: EventCallback<Rejected>): void;
  addEventListener(
    type: "rowchange",
    callback: EventCallback<RowChange<K>>
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject
  ): void {
    super.addEventListener(type, callback, { signal: this.#aborter.signal });
  }

  removeEventListener(type: "load", callback: EventCallback<Load<K>>): void;
  removeEventListener(
    type: "rejected",
    callback: EventCallback<Rejected>
  ): void;
  removeEventListener(
    type: "rowchange",
    callback: EventCallback<RowChange<K>>
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject
  ): void {
    super.removeEventListener(type, callback);
  }

  /**
   * Mounts the spotlight into a container. Defers the initial fill to the next rAF so the element has a measurable rect. Throws if already attached.
   * @param elementOrElementId - The container element or its DOM id.
   */
  attach(elementOrElementId: HTMLElement | string): void {
    if (this.attached) {
      throw new Error("spotlight is attached");
    }

    const element =
      typeof elementOrElementId === "string"
        ? document.getElementById(elementOrElementId)
        : elementOrElementId;

    element.appendChild(this.#element);

    const observer = new ResizeObserver(([el]) => {
      if (this.attached && this.#loaded) {
        // update rect for height
        this.#rect = el.contentRect;
        this.#render({ ...this.#measure() });
      }
    });
    observer.observe(this.#element);
    // Run in the next animation frame for a correct measurement;

    const fill = () =>
      requestAnimationFrame(() => {
        this.#rect = this.#element.getBoundingClientRect();

        // wait for height
        if (this.#rect.height) {
          this.#fill();
          return;
        }

        // try again
        fill();
      });

    fill();
  }

  /** Aborts all listeners, destroys both sections, and removes the element from the DOM. */
  destroy(): void {
    this.#aborter.abort();
    this.#backward?.destroy();
    this.#forward?.destroy();
    this.#element?.remove();
    this.#scrollReader?.destroy();
  }

  /**
   * @returns A callback that loads the next page, or `undefined` when the forward section is exhausted.
   */
  next() {
    if (this.#forward.finished) return undefined;
    return async () => {
      await this.#next();
    };
  }

  /**
   * @returns A callback that loads the previous page, or `undefined` when the backward section is exhausted.
   */
  previous() {
    if (this.#backward.finished) return undefined;
    return async () => {
      await this.#previous();
    };
  }

  /**
   * Notifies the spotlight of a byte-size change for an item; triggers memory-limit evaluation when `maxItemsSizeBytes` is configured.
   * @param key - The item's description string.
   * @param add - The updated size in bytes.
   */
  sizeChange(key: string, add: number) {
    this.#validate?.(key, add);
  }

  /**
   * Applies `updater` to every currently rendered item and stores it so newly rendered items receive it too.
   * @param updater - Called with each item's ID.
   */
  updateItems(updater: Updater): void {
    this.#backward?.updateItems(updater);
    this.#forward?.updateItems(updater);
    this.#updater = updater;
  }

  /**
   * Creates an iterator for programmatic item navigation starting from the current forward section.
   * @returns An {@link Iter} bound to the current focus and section state.
   */
  createIter(): Iter {
    const ref = { section: this.#forward };
    return new IterImpl(
      this.#focus,
      this.#createRequest(false),
      this.#createRenderer(false, true),
      ref.section,
      this.#createSibling(ref)
    );
  }

  /**
   * Returns a Sibling that resolves the opposite section via a ref so iterators can cross section boundaries without holding stale pointers.
   * @param ref - Mutable box holding the caller's current section; updated when `apply=true`.
   * @returns A Sibling function for use with {@link Iter} and {@link Section}.
   */
  #createSibling(ref: { section: Section<K, V> }): Sibling<K, V> {
    return (apply) => {
      const result =
        ref.section === this.#forward ? this.#backward : this.#forward;
      if (apply) ref.section = result;
      return result;
    };
  }

  /**
   * Returns a Renderer that applies new rows to the DOM and handles section swaps.
   * @param reverse - When `true`, guards on `scrollTop < 0` and negates the scroll offset for backward loading.
   * @param render - When `false`, skips the rAF and calls the runner synchronously; used during the initial fill.
   * @returns A Renderer for use with {@link Section.next}.
   */
  #createRenderer(reverse: boolean, render: boolean): Renderer<K, V> {
    return (runner) => {
      if (!render) {
        runner();
        return;
      }

      const run = () =>
        requestAnimationFrame(() => {
          const tooFar = reverse
            ? this.#element.scrollTop < ZERO
            : this.#element.scrollTop > this.#containerHeight;

          if (tooFar || this.#scrollReader.zooming()) {
            requestAnimationFrame(run);
            return;
          }

          const result = runner();

          let offset: false | number;
          if (reverse) {
            offset = typeof result.offset === "number" ? -result.offset : false;
            if (result.section) {
              const forward = this.#backward;
              this.#backward = result.section;
              this.#backward.attach(this.#element);
              this.#forward.destroy();
              this.#forward = forward;
            }
          } else {
            const before = this.#containerHeight;
            offset = false;
            if (result.section) {
              const backward = this.#forward;
              this.#forward = result.section;
              this.#forward.attach(this.#element);
              this.#backward.destroy();
              this.#backward = backward;
              offset = before - this.#containerHeight + this.#config.spacing;
            }
          }

          this.#render({
            go: false,
            offset,
            zooming: false,
            ...this.#measure(),
          });
        });

      run();
    };
  }

  /**
   * Returns a Request that fetches a page and attaches the focus function.
   * @param reverse - When `true`, reverses item order and swaps next/previous cursors for backward traversal.
   * @returns A Request for use with {@link Section.next}.
   */
  #createRequest(reverse: boolean): Request<K, V> {
    return async (key) => {
      const { items, next, previous } = await this.#get(key);
      return reverse
        ? {
            focus: this.#focus,
            items: [...items].reverse(),
            next: previous,
            previous: next,
          }
        : { focus: this.#focus, items, next, previous };
    };
  }

  /**
   * Returns a Focus function that updates `#focused` and re-renders to scroll the item into view.
   * A new function is returned each call so each Request closure captures an independent reference.
   * @returns A Focus function; call with an ID to set focus, or with no argument to read it.
   */
  get #focus() {
    return (id?: ID) => {
      if (id) {
        this.#focused = id;
      }

      this.#render({
        at: { description: this.#focused.description, offset: ZERO },
        ...this.#measure(),
      });
      return this.#focused;
    };
  }

  get #pivot() {
    let base = this.#backward.height;
    if (base) base += this.#config.spacing;
    return base;
  }

  get #aspectRatio() {
    return this.#width / this.#height;
  }

  get #containerHeight() {
    return this.#forward.height + this.#pivot;
  }

  get #height() {
    return this.#rect.height;
  }

  get #padding() {
    return this.#height;
  }

  #handleHighMemoryUsage(
    items: ItemData<K, V>[],
    map: Map<string, number>,
    average: number
  ) {
    let bytes = ZERO;
    const threshold = this.#config.maxItemsSizeBytes;
    let use: typeof items = [];
    for (const item of items) {
      bytes += map.get(item.id.description) ?? average;
      use.push(item);

      if (bytes >= threshold) {
        break;
      }
    }

    use = use.slice(ZERO, use.length - ONE);
    const current = this.#config.rowAspectRatioThreshold(this.#width);
    let proposed = current;
    const itemAspectRatios = use.map(({ aspectRatio }) => aspectRatio);
    let tiledAspectRatio: number;

    do {
      proposed -= ONE / TWO;

      if (proposed < MIN_ASPECT_RATIO_RECOMMENDATION) {
        break;
      }

      const breakpoints = tile(itemAspectRatios, proposed, true);
      const rows: number[] = [];
      let start = ZERO;
      for (const end of breakpoints) {
        rows.push(ONE / sum(itemAspectRatios.slice(start, end)));
        start = end;
      }

      tiledAspectRatio = ONE / sum(rows);
      // container aspect ratio divided by THREE increases height by 3x
      // rendering virtualization attempts to fill 3x container height
      // 3.5x gives a buffer so the recommendation is not invalidated as often
    } while (tiledAspectRatio > this.#aspectRatio / 3.5);

    proposed = Math.max(proposed, MIN_ASPECT_RATIO_RECOMMENDATION);
    if (proposed < current) {
      this.#rejected = true;
      this.dispatchEvent(new Rejected(proposed));
    }
  }

  get #sections() {
    const forward = this.#forward;
    const backward = this.#backward;
    return { backward, forward };
  }

  get #width() {
    return this.#rect.width - SCROLLBAR_WIDTH * TWO;
  }

  #attachScrollReader() {
    if (this.#scrollReader) {
      return;
    }
    this.#scrollReader = createScrollReader(
      this.#element,
      (zooming, dispatchOffset) =>
        this.#render({ dispatchOffset, zooming, ...this.#measure() }),
      () => this.#zooming()
    );
  }

  #measure() {
    const ar = this.#config.rowAspectRatioThreshold(this.#width);
    const items: ItemData<K, V>[] = [];
    const map = new Map<string, number>();
    const promises: Promise<number>[] = [];

    let bytes = ZERO;
    let count = ZERO;

    if (!this.#config.maxItemsSizeBytes) {
      // No size measurements required
      return {};
    }

    const validate = (key: string, add: number) => {
      map.set(key, add);
      if (
        sum(Array.from(map.values())) >= this.#config.maxItemsSizeBytes &&
        this.#config.rowAspectRatioThreshold(this.#width) > ONE
      ) {
        this.#handleHighMemoryUsage(items, map, bytes / count);
      }
    };

    this.#validate = validate;

    return {
      measure: (item: ItemData<K, V>, itemBytes: Promise<number>) => {
        if (this.#rejected || ar <= MIN_ASPECT_RATIO_RECOMMENDATION) {
          return;
        }

        promises.push(itemBytes);
        items.push(item);

        itemBytes.then((add) => {
          if (this.#rejected) {
            return;
          }

          map.set(item.id.description, add);
          bytes += add;
          count++;
          const max = this.#loaded
            ? this.#config.maxItemsSizeBytes
            : // For initial load, reduce by three as a simple adjustment
              // because only only enough items to fill the screen have been
              // loaded. As opposed a screen height + padding render
              this.#config.maxItemsSizeBytes / THREE;

          if (bytes >= max && ar > ONE) {
            this.#handleHighMemoryUsage(items, map, bytes / count);
            return;
          }
        });
      },
      close: async () => {
        if (this.#rejected) {
          return;
        }

        await Promise.allSettled(promises);
        if (!this.#loaded) {
          this.#loaded = true;
          this.dispatchEvent(new Load(this.#config.key));
        }
      },
    };
  }

  #render({
    at,
    close,
    dispatchOffset = false,
    go = true,
    measure,
    offset = false,
    zooming,
  }: {
    at?: At;
    close?: () => Promise<void>;
    dispatchOffset?: boolean;
    go?: boolean;
    offset?: number | false;
    measure?: Measure<K, V>;
    zooming?: boolean;
  }) {
    if (this.#aborter.signal.aborted) {
      return;
    }

    if (go && offset !== false) {
      this.#forward.top = this.#pivot + this.#config.offset;
      this.#backward.top = this.#config.offset;
    }

    const top = findTop({
      at,
      offset,
      scrollTop: this.#element.scrollTop,
      ...this.#sections,
    });

    const params = {
      measure,
      spotlight: this,
      updater: (id) => this.#updater(id),
      zooming,
    };

    const backwardResult = this.#backward.render({
      target: top + this.#height + this.#padding,
      threshold: (n) => n > top - this.#padding,
      top: top + this.#config.offset,
      ...params,
    });

    const forwardResult = this.#forward.render({
      target: top - this.#padding - this.#backward.height,
      threshold: (n) =>
        n < top + this.#height + this.#padding - this.#backward.height,
      top: top - this.#backward.height + this.#config.offset,
      ...params,
    });

    const rowChange = handleRowChange({
      at,
      dispatchOffset,
      keys: this.#keys,
      matches: {
        backward: backwardResult?.match,
        forward: forwardResult?.match,
      },
    });

    if (rowChange) {
      this.dispatchEvent(rowChange);
    }

    if (!go && offset !== false) {
      this.#forward.top = this.#pivot + this.#config.offset;
      this.#backward.top = this.#config.offset;
    }

    scrollToPosition({ at, el: this.#element, offset, top, ...this.#sections });
    this.#attachScrollReader();
    close?.();
    if (!zooming && backwardResult.more) this.#previous();
    if (!zooming && forwardResult.more) this.#next();
  }

  #zooming() {
    return (
      (this.#width /
        (this.#height *
          Math.max(this.#config.rowAspectRatioThreshold(this.#width), ONE))) *
      ZOOMING_COEFFICIENT
    );
  }

  async #fill() {
    this.#forward = new Section({
      at: this.#config.at?.description,
      config: this.#config,
      direction: DIRECTION.FORWARD,
      edge: { key: this.#config.key, remainder: [] },
      width: this.#width,
    });
    this.#forward.attach(this.#element);

    await this.#next(false);
    while (!this.#forward.finished && this.#forward.height < this.#height) {
      await this.#next(false);
    }

    await this.#previous(false);
    this.#render({
      at: this.#config.at,
      offset: -this.#pivot,
      zooming: false,
      ...this.#measure(),
    });

    if (!this.#config.maxItemsSizeBytes) {
      this.#loaded = true;
      this.dispatchEvent(new Load(this.#config.key));
    }
  }

  async #get(key: K): Promise<Response<K, V>> {
    if (key === null) {
      return { items: [], next: null, previous: null };
    }
    const result = await this.#config.get(key);
    for (const { id } of result.items) {
      this.#keys.set(id, key);
    }

    if (!this.#backward) {
      let remainder = [];
      const hasAt = result.items
        .map((item) => item.id.description)
        .indexOf(this.#config.at?.description);

      if (hasAt >= ZERO) {
        remainder = result.items.slice(ZERO, hasAt).reverse();
        result.items = result.items.slice(hasAt);
      }

      this.#backward = new Section({
        config: this.#config,
        direction: DIRECTION.BACKWARD,
        edge:
          result.previous !== null
            ? { key: result.previous, remainder }
            : { key: null, remainder },
        width: this.#width,
      });
      this.#backward.attach(this.#element);
    }

    return result;
  }

  /**
   * Loads the next page into the forward section.
   * @param render - When `false`, skips rAF-gated DOM updates; used during the initial fill.
   */
  async #next(render = true) {
    const ref = { section: this.#forward };
    return await ref.section.next(
      this.#createRequest(false),
      this.#createRenderer(false, render),
      this.#createSibling(ref)
    );
  }

  /**
   * Loads the previous page into the backward section.
   * @param render - When `false`, skips rAF-gated DOM updates; used during the initial fill.
   */
  async #previous(render = true) {
    const ref = { section: this.#backward };
    return await ref.section.next(
      this.#createRequest(true),
      this.#createRenderer(true, render),
      this.#createSibling(ref)
    );
  }
}
