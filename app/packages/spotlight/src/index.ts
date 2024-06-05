/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import styles from "./styles.module.css";

import type { EventCallback } from "./events";
import type { SpotlightConfig, Updater } from "./types";

import {
  DEFAULT_MARGIN,
  DEFAULT_OFFSET,
  DEFAULT_SPACING,
  DIRECTION,
  DIV,
  ONE,
  TWO,
  ZERO,
  ZOOMING_COEFFICIENT,
} from "./constants";
import { Load, PageChange } from "./events";
import { Section } from "./section";
import { create } from "./utilities";
import { createScrollReader } from "./zooming";

export { Load, PageChange } from "./events";
export type * from "./types";

export default class Spotlight<K, V> extends EventTarget {
  readonly #config: SpotlightConfig<K, V>;
  readonly #element = create(DIV);
  readonly #keys = new WeakMap<symbol, K>();

  #backward: Section<K, V>;
  #forward: Section<K, V>;
  #page: K;
  #rect?: DOMRect;
  #scrollReader?: ReturnType<typeof createScrollReader>;
  #updater?: Updater;

  constructor(config: SpotlightConfig<K, V>) {
    super();
    this.#config = {
      margin: DEFAULT_MARGIN,
      offset: DEFAULT_OFFSET,
      spacing: DEFAULT_SPACING,
      ...config,
    };

    this.#element.classList.add(styles.spotlight);

    this.#page = config.key;
  }

  get attached() {
    return Boolean(this.#element.parentElement);
  }

  addEventListener(type: "load", callback: EventCallback<Load<K>>): void;
  addEventListener(
    type: "pagechange",
    callback: EventCallback<PageChange<K>>
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject
  ): void {
    super.addEventListener(type, callback);
  }

  removeEventListener(type: "load", callback: EventCallback<Load<K>>): void;
  removeEventListener(
    type: "pagechange",
    callback: EventCallback<PageChange<K>>
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
    this.#rect = this.#element.parentElement.getBoundingClientRect();
    this.#fill();
  }

  destroy(): void {
    if (!this.attached) {
      throw new Error("spotlight is not attached");
    }

    this.#element.remove();
    this.#scrollReader?.destroy();
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
    return this.#rect.width - this.#config.margin * TWO;
  }

  async #next(render = true) {
    const forward = async (key) => {
      const { items, next, previous } = await this.#get(key);

      return {
        items,
        next,
        previous,
      };
    };

    await this.#forward.next(forward, (runner) => {
      if (!render) {
        runner();
        return;
      }

      requestAnimationFrame(() => {
        const { section } = runner();
        const before = this.#containerHeight;
        let offset: false | number = false;
        if (section) {
          const backward = this.#forward;
          this.#forward = section;
          this.#forward.attach(this.#element);
          this.#backward.remove();
          this.#backward = backward;
          offset = before - this.#containerHeight + this.#config.spacing;
        }

        this.#render({ zooming: false, offset, go: false });
      });
    });
  }

  async #previous(render = true) {
    const backward = async (key) => {
      const { items, next, previous } = await this.#get(key);

      return {
        items: [...items].reverse(),
        next: previous,
        previous: next,
      };
    };

    await this.#backward.next(backward, (runner) => {
      if (!render) {
        runner();
        return;
      }

      const run = () =>
        requestAnimationFrame(() => {
          if (
            this.#element.scrollTop > this.#containerHeight ||
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

            this.#forward.remove();
            this.#forward = forward;
          }

          this.#render({
            go: false,
            offset: typeof offset === "number" ? -offset : false,
            zooming: false,
          });
        });

      run();
    });
  }

  async #fill() {
    this.#forward = new Section({
      config: this.#config,
      direction: DIRECTION.FORWARD,
      edge: { key: this.#config.key, remainder: [] },
      width: this.#width,
    });
    this.#forward.attach(this.#element);

    await this.#next(false);

    while (
      this.#containerHeight < this.#height + this.#padding * TWO &&
      !this.#forward.finished
    ) {
      await this.#next(false);
    }

    await this.#previous(false);

    requestAnimationFrame(() => {
      this.#render({
        zooming: false,
        offset: -this.#pivot,
      });

      requestAnimationFrame(() => {
        this.#scrollReader = createScrollReader(
          this.#element,
          (zooming) => {
            this.#render({ zooming });
          },
          () => {
            return (
              (this.#width /
                (this.#height *
                  Math.max(this.#config.rowAspectRatioThreshold, ONE))) *
              ZOOMING_COEFFICIENT
            );
          }
        );
      });

      this.dispatchEvent(new Load(this.#config.key));
    });
  }

  async #get(key: K) {
    const result = await this.#config.get(key);
    if (!this.#backward) {
      this.#backward = new Section({
        config: this.#config,
        direction: DIRECTION.BACKWARD,
        edge:
          result.previous !== null
            ? { key: result.previous, remainder: [] }
            : { key: null, remainder: [] },
        width: this.#width,
      });
      this.#backward.attach(this.#element);
    }

    for (const { id } of result.items) {
      this.#keys.set(id, key);
    }

    return result;
  }

  #render({
    go = true,
    offset = false,
    zooming,
  }: {
    go?: boolean;
    offset?: number | false;
    zooming: boolean;
  }) {
    if (go && offset !== false) {
      this.#forward.top = this.#pivot + this.#config.offset;
      this.#backward.top = this.#config.offset;
    }

    const top = this.#element.scrollTop - (offset === false ? ZERO : offset);

    const backward = this.#backward.render({
      config: this.#config,
      target: top + this.#height + this.#padding,
      threshold: (n) => n > top - this.#padding,
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

    let pageRow = forward.match?.row;

    if (!pageRow || backward.match.delta < forward.match.delta) {
      pageRow = backward.match.row;
    }

    if (offset === false && pageRow && !zooming) {
      const page = this.#keys.get(pageRow.id);
      if (page !== this.#page) {
        this.#page = page;
        this.dispatchEvent(new PageChange(page));
      }
    }

    if (!go && offset !== false) {
      this.#forward.top = this.#pivot + this.#config.offset;
      this.#backward.top = this.#config.offset;
    }

    if (offset !== false && top) {
      this.#element.scrollTo(ZERO, top);
    }

    if (!zooming && backward.more) this.#previous();
    if (!zooming && forward.more) this.#next();
  }
}
