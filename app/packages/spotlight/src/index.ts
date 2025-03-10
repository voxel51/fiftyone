/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import "@af-utils/scrollend-polyfill";

import styles from "./styles.module.css";

import {
  DEFAULT_OFFSET,
  DEFAULT_SPACING,
  DIRECTION,
  DIV,
  FOUR,
  ONE,
  SCROLLBAR_WIDTH,
  TWO,
  ZERO,
  ZOOMING_COEFFICIENT,
} from "./constants";
import createScrollReader from "./createScrollReader";
import type { EventCallback, RowChange } from "./events";
import { Load, Rejected } from "./events";
import Section from "./section";
import tile from "./tile";
import type {
  At,
  ID,
  ItemData,
  Measure,
  Response,
  SpotlightConfig,
  Updater,
} from "./types";
import {
  create,
  findTop,
  handleRowChange,
  runWhileWithHandler,
  scrollToPosition,
  sum,
} from "./utilities";

export { Load, Rejected, RowChange } from "./events";
export * from "./types";

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
  #validate: (key: string, add: number) => void;

  constructor(config: SpotlightConfig<K, V>) {
    super();
    this.#config = {
      offset: DEFAULT_OFFSET,
      spacing: DEFAULT_SPACING,
      ...config,
    };
    this.#element.classList.add(styles.spotlight);
    this.#config.scrollbar && this.#element.classList.add(styles.scrollbar);
  }

  get attached() {
    return Boolean(this.#element.parentElement);
  }

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

  attach(elementOrElementId: HTMLElement | string): void {
    if (this.attached) {
      throw new Error("spotlight is attached");
    }

    const element =
      typeof elementOrElementId === "string"
        ? document.getElementById(elementOrElementId)
        : elementOrElementId;

    element.appendChild(this.#element);

    const observer = new ResizeObserver(() => {
      this.attached && this.#loaded && this.#render({ ...this.#race() });
    });
    observer.observe(this.#element);
    this.#rect = this.#element.getBoundingClientRect();
    this.#fill();
  }

  destroy(): void {
    if (!this.attached) {
      console.error("spotlight is not attached");
      return;
    }

    this.#aborter.abort();
    this.#backward?.destroy();
    this.#forward?.destroy();
    this.#element?.remove();
    this.#scrollReader?.destroy();
  }

  next() {
    if (this.#forward.finished) return undefined;
    return async () => {
      await this.#next();
    };
  }

  previous() {
    if (this.#backward.finished) return undefined;
    return async () => {
      await this.#previous();
    };
  }

  sizeChange(key: string, add: number) {
    this.#validate(key, add);
  }

  updateItems(updater: Updater): void {
    this.#backward?.updateItems(updater);
    this.#forward?.updateItems(updater);
    this.#updater = updater;
  }

  get #minAspectRatioRecommendation() {
    return ONE + ONE / TWO;
  }

  get #pivot() {
    let base = this.#backward.height;
    if (base) base += this.#config.spacing;
    return base;
  }

  get #aspectRatio() {
    return this.#width / this.#height;
  }

  get #sizeThreshold() {
    return this.#config.maxItemsSizeBytes / TWO;
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

  #handleHighMemoryUsage(items: ItemData<K, V>[], map: Map<string, number>) {
    let bytes = ZERO;
    const threshold = this.#sizeThreshold;
    let use: typeof items = [];
    for (const item of items) {
      bytes += map.get(item.id.description);
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

      if (proposed < ONE + ONE / TWO) {
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
    } while (tiledAspectRatio > this.#aspectRatio / FOUR);

    proposed = Math.max(proposed, ONE + ONE / TWO);
    if (!this.#rejected && proposed < current) {
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
        this.#render({ dispatchOffset, zooming, ...this.#race() }),
      () => this.#zooming()
    );
  }

  #race() {
    const items: ItemData<K, V>[] = [];
    const map = new Map<string, number>();

    const validate = (key: string, add: number) => {
      map.set(key, add);
      if (
        sum(Array.from(map.values())) >= this.#sizeThreshold &&
        this.#config.rowAspectRatioThreshold(this.#width) > ONE
      ) {
        this.#handleHighMemoryUsage(items, map);
      }
    };

    this.#validate = validate;

    const measure = (item: ItemData<K, V>, add: number) => {
      if (!this.#config.maxItemsSizeBytes) {
        return;
      }

      const ar = this.#config.rowAspectRatioThreshold(this.#width);
      if (ar <= this.#minAspectRatioRecommendation) {
        return;
      }

      items.push(item);
      validate(item.id.description, add);
    };

    return {
      measure: (
        item: ItemData<K, V>,
        adder: () => number | Promise<number>
      ) => {
        if (this.#rejected) {
          return;
        }

        const add = adder();
        if (add instanceof Promise) {
          add.then((add) => measure(item, add));
          return;
        }

        measure(item, add);
      },
    };
  }

  #render({
    at,
    dispatchOffset = false,
    go = true,
    measure,
    offset = false,
    zooming,
  }: {
    at?: At;
    dispatchOffset?: boolean;
    go?: boolean;
    offset?: number | false;
    measure: Measure<K, V>;
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

    while (!this.#forward.finished && this.#height > this.#forward.height) {
      await this.#next(false);
    }

    await this.#previous(false);

    let bytes = ZERO;
    const items: ItemData<K, V>[] = [];
    const map = new Map<string, number>();

    await runWhileWithHandler(
      () => {
        this.#render({
          at: this.#config.at,
          offset: -this.#pivot,
          measure: (item, adder) => {
            const add = adder();
            const ar = this.#config.rowAspectRatioThreshold(this.#width);
            if (
              !this.#config.maxItemsSizeBytes ||
              ar <= this.#minAspectRatioRecommendation
            ) {
              return;
            }

            if (add instanceof Promise) {
              throw add;
            }

            if (map.has(item.id.description)) {
              return;
            }

            items.push(item);
            map.set(item.id.description, add);
            bytes += add;

            if (bytes >= this.#sizeThreshold && ar > ONE) {
              throw bytes;
            }
          },
          zooming: false,
        });
        this.#loaded = true;
      },
      () => !this.#loaded,
      async (response) => {
        if (response instanceof Promise) {
          await response;
          return true;
        }

        if (typeof response === "number") {
          this.#handleHighMemoryUsage(items, map);
          return false;
        }

        console.error(response);
        return false;
      }
    );

    if (this.#loaded && !this.#aborter.signal.aborted) {
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

  async #next(render = true) {
    const forward = async (key) => {
      const { items, next, previous } = await this.#get(key);

      return {
        focus: (id?: ID) => {
          if (id) {
            this.#focused = id;
          }

          this.#render({
            at: { description: this.#focused.description, offset: ZERO },
            ...this.#race(),
          });
          return this.#focused;
        },
        items,
        next,
        previous,
      };
    };

    let section = this.#forward;
    return await section.next(
      forward,
      (runner) => {
        if (!render) {
          runner();
          return;
        }

        const run = () =>
          requestAnimationFrame(() => {
            if (
              this.#element.scrollTop > this.#containerHeight ||
              this.#scrollReader.zooming()
            ) {
              requestAnimationFrame(run);
              return;
            }

            const { section } = runner();
            const before = this.#containerHeight;
            let offset: false | number = false;
            if (section) {
              const backward = this.#forward;
              this.#forward = section;
              this.#forward.attach(this.#element);
              this.#backward.destroy();
              this.#backward = backward;
              offset = before - this.#containerHeight + this.#config.spacing;
            }

            this.#render({
              go: false,
              offset,
              zooming: false,
              ...this.#race(),
            });
          });

        run();
      },
      (apply) => {
        const result =
          section === this.#forward ? this.#backward : this.#forward;
        if (apply) {
          section = result;
        }
        return result;
      }
    );
  }

  async #previous(render = true) {
    const backward = async (key) => {
      const { items, next, previous } = await this.#get(key);

      return {
        focus: (id?: ID) => {
          if (id) {
            this.#focused = id;
          }

          this.#render({
            at: { description: this.#focused.description, offset: ZERO },
            ...this.#race(),
          });
          return this.#focused;
        },
        items: [...items].reverse(),
        next: previous,
        previous: next,
      };
    };

    let section = this.#backward;
    return await section.next(
      backward,
      (runner) => {
        if (!render) {
          runner();
          return;
        }

        const run = () =>
          requestAnimationFrame(() => {
            if (
              this.#element.scrollTop < ZERO ||
              this.#scrollReader.zooming()
            ) {
              requestAnimationFrame(run);
              return;
            }

            const result = runner();
            const offset = result.offset;
            if (result.section) {
              const forward = this.#backward;
              this.#backward = result.section;
              this.#backward.attach(this.#element);

              this.#forward.destroy();
              this.#forward = forward;
            }

            this.#render({
              go: false,
              offset: typeof offset === "number" ? -offset : false,
              zooming: false,
              ...this.#race(),
            });
          });

        run();
      },
      (apply) => {
        const result =
          section === this.#forward ? this.#backward : this.#forward;
        if (apply) {
          section = result;
        }
        return result;
      }
    );
  }
}
