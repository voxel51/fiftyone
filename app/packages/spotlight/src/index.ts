/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import "@af-utils/scrollend-polyfill";

import styles from "./styles.module.css";

import type { EventCallback } from "./events";
import type { At, ID, Response, SpotlightConfig, Updater } from "./types";

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
import { Load, RowChange } from "./events";
import Section from "./section";
import { create } from "./utilities";

export { Load, RowChange } from "./events";
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
      this.attached &&
        requestAnimationFrame(() =>
          this.#forward ? this.#render({}) : this.#fill()
        );
    });
    observer.observe(this.#element);
  }

  destroy(): void {
    if (!this.attached) {
      console.error("spotlight is not attached");
      return;
    }

    this.#backward?.destroy(!this.#config.retainItems);
    this.#forward?.destroy(!this.#config.retainItems);
    this.#element?.classList.remove(styles.spotlightLoaded);
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

  get #width() {
    return this.#rect.width - SCROLLBAR_WIDTH * TWO;
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

    requestAnimationFrame(() => {
      this.#render({
        zooming: false,
        offset: -this.#pivot,
        at: this.#config.at,
      });

      requestAnimationFrame(() => {
        this.#scrollReader = createScrollReader(
          this.#element,
          (zooming, dispatchOffset) =>
            this.#render({ dispatchOffset, zooming }),
          () => {
            return (
              (this.#width /
                (this.#height *
                  Math.max(
                    this.#config.rowAspectRatioThreshold(this.#width),
                    ONE
                  ))) *
              ZOOMING_COEFFICIENT
            );
          }
        );
      });

      this.dispatchEvent(new Load(this.#config.key));
      this.#element.classList.add(styles.spotlightLoaded);
    });
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

  #render({
    at,
    dispatchOffset = false,
    go = true,
    offset = false,
    zooming,
  }: {
    at?: At;
    dispatchOffset?: boolean;
    go?: boolean;
    offset?: number | false;
    zooming?: boolean;
  }) {
    if (go && offset !== false) {
      this.#forward.top = this.#pivot + this.#config.offset;
      this.#backward.top = this.#config.offset;
    }

    let top = this.#element.scrollTop - (offset === false ? ZERO : offset);
    if (at) {
      const row = this.#forward.find(at.description);
      if (row) {
        top = this.#backward.height + row.from - at.offset;
      }
    }

    const backward = this.#backward.render({
      config: this.#config,
      target: top + this.#height + this.#padding,
      threshold: (n) => {
        return n > top - this.#padding;
      },
      top: top + this.#config.offset,
      updater: (id) => this.#updater(id),
      zooming,
    });

    const forward = this.#forward.render({
      config: this.#config,
      target: top - this.#padding - this.#backward.height,
      threshold: (n) => {
        return n < top + this.#height + this.#padding - this.#backward.height;
      },
      top: top - this.#backward.height + this.#config.offset,
      updater: (id) => this.#updater(id),
      zooming,
    });

    if (dispatchOffset || at) {
      let item = forward.match?.row.first;
      let delta = forward.match?.delta;

      if (!item || (backward.match && backward.match.delta < delta)) {
        item = backward.match?.row.first;
        delta = backward.match?.delta;
      }

      this.#keys.has(item) &&
        this.dispatchEvent(
          new RowChange(item, this.#keys.get(item), Math.abs(delta))
        );
    }

    if (!go && offset !== false) {
      this.#forward.top = this.#pivot + this.#config.offset;
      this.#backward.top = this.#config.offset;
    }

    if (at) {
      const row = this.#forward.find(at.description);
      if (row) {
        this.#element.scrollTo(
          ZERO,
          this.#backward.height + row.from - at.offset
        );
      } else {
        const row = this.#backward.find(at.description);
        if (row) {
          this.#element.scrollTo(
            ZERO,
            this.#backward.height - row.from - row.height
          );
        }
      }
    } else if (offset !== false && top) {
      this.#element.scrollTo(ZERO, top);
    }

    if (!zooming && backward.more) this.#previous();
    if (!zooming && forward.more) this.#next();
  }
}
