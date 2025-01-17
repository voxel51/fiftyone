/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import "@af-utils/scrollend-polyfill";

import styles from "./styles.module.css";

import type { EventCallback } from "./events";
import type {
  At,
  ID,
  Measure,
  Response,
  SpotlightConfig,
  Updater,
} from "./types";

import {
  DEFAULT_OFFSET,
  DEFAULT_SPACING,
  DIRECTION,
  DIV,
  ONE,
  SCROLLBAR_WIDTH,
  TWO,
  ZERO,
  ZOOMING_COEFFICIENT,
} from "./constants";
import createScrollReader from "./createScrollReader";
import type { RowChange } from "./events";
import { Load, Rejected } from "./events";
import Section from "./section";
import {
  create,
  findTop,
  handleRowChange,
  scrollToPosition,
} from "./utilities";

export { Load, Rejected, RowChange } from "./events";
export * from "./types";

export default class Spotlight<K, V> extends EventTarget {
  readonly #config: SpotlightConfig<K, V>;
  readonly #element = create(DIV);
  readonly #keys = new WeakMap<ID, K>();

  #backward: Section<K, V>;
  #focused?: ID;
  #forward: Section<K, V>;
  #rect?: DOMRect;
  #scrollReader?: ReturnType<typeof createScrollReader>;
  #updater?: Updater;

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
    super.addEventListener(type, callback);
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
      this.#rect = this.#element.getBoundingClientRect();
      if (this.attached) {
        this.#forward ? this.#render({}) : this.#fill();
      }
    });
    observer.observe(this.#element);
  }

  destroy(): void {
    if (!this.attached) {
      console.error("spotlight is not attached");
      return;
    }

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

  async previous() {
    if (this.#backward.finished) return undefined;
    return async () => {
      await this.#previous();
    };
  }

  updateItems(updater: Updater): void {
    this.#backward?.updateItems(updater);
    this.#forward?.updateItems(updater);
    this.#updater = updater;
  }

  get #pivot() {
    let base = this.#backward.height;
    if (base) base += this.#config.spacing;
    return base;
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

  get #recommendedRowAspectRatioThreshold() {
    return 10;
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
    this.#scrollReader = createScrollReader(
      this.#element,
      (zooming, dispatchOffset) => this.#render({ dispatchOffset, zooming }),
      () => this.#zooming()
    );
  }

  #render({
    at,
    dispatchOffset = false,
    go = true,
    measure = () => undefined,
    offset = false,
    zooming,
  }: {
    at?: At;
    dispatchOffset?: boolean;
    go?: boolean;
    offset?: number | false;
    measure?: Measure;
    zooming?: boolean;
  }) {
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
      config: this.#config,
      measure,
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

    while (this.#containerHeight < this.#height && !this.#forward.finished) {
      await this.#next(false);
    }

    await this.#previous(false);

    this.#attachScrollReader();

    let bytes = 0;
    let loading = true;
    while (loading) {
      try {
        this.#render({
          at: this.#config.at,
          offset: -this.#pivot,
          measure: (next: Promise<void> | number) => {
            if (next instanceof Promise) {
              throw next;
            }

            bytes += next;

            if (bytes > this.#config.maxItemsSizeBytes) {
              throw bytes;
            }
          },
          zooming: false,
        });
        loading = false;
      } catch (promiseOrBytes) {
        if (promiseOrBytes instanceof Promise) {
          await promiseOrBytes;
        } else if (typeof promiseOrBytes === "number") {
          this.dispatchEvent(
            new Rejected(this.#recommendedRowAspectRatioThreshold)
          );
        } else {
          console.error(promiseOrBytes);
          break;
        }
      }
    }

    this.dispatchEvent(new Load(this.#config.key));
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

            this.#render({ zooming: false, offset, go: false });
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
