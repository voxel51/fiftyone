/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { EventCallback, Load, PageChange } from "./events";
import { Render } from "./row";
import { Response, Section } from "./section";
import { flashlight } from "./styles.module.css";
import { createScrollReader } from "./zooming";

export { Load, PageChange } from "./events";
export type { Response } from "./section";
export type Get<K, V> = (key: K) => Promise<Response<K, V>>;

export interface FlashlightConfig<K, V> {
  get: Get<K, V>;
  render: Render;
  key: K;
  rowAspectRatioThreshold: number;
}

export default class Flashlight<K, V> extends EventTarget {
  readonly #config: FlashlightConfig<K, V>;
  readonly #element = document.createElement("div");

  #rect?: DOMRect;
  #scrollReader?: ReturnType<typeof createScrollReader>;

  #forward: Section<K, V>;
  #backward: Section<K, V>;

  readonly #keys = new WeakMap<symbol, K>();
  #page: K;

  constructor(config: FlashlightConfig<K, V>) {
    super();
    this.#config = config;

    this.#element.classList.add(flashlight);

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

  attach(element: HTMLElement | string): void {
    if (this.attached) {
      throw new Error("flashlight is attached");
    }

    if (typeof element === "string") {
      element = document.getElementById(element);
    }

    element.appendChild(this.#element);
    this.#rect = this.#element.parentElement.getBoundingClientRect();
    this.#fill();
  }

  detach(): void {
    if (!this.attached) {
      throw new Error("flashlight is not attached");
    }

    this.#element.parentElement.removeChild(this.#element);
  }

  get #containerHeight() {
    return this.#forward.height + this.#backward.height;
  }

  get #height() {
    return this.#rect.height;
  }

  get #padding() {
    return this.#height * 1;
  }

  get #width() {
    return this.#rect.width - 16;
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
          offset = before - this.#containerHeight - 48;
        }

        console.log(offset);

        this.#render(false, offset, false);
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
            this.#element.scrollTop < 0 ||
            this.#scrollReader.zooming()
          ) {
            requestAnimationFrame(run);
            return;
          }
          const { section, offset } = runner();
          if (section) {
            const forward = this.#backward;
            this.#backward = section;
            this.#backward.attach(this.#element);

            this.#forward.remove();
            this.#forward = forward;
          }

          this.#render(false, typeof offset === "number" ? -offset : false);
        });

      run();
    });
  }

  async #fill() {
    this.#forward = new Section(
      { key: this.#config.key, remainder: [] },
      "forward",
      this.#config.rowAspectRatioThreshold,
      this.#width
    );
    this.#forward.attach(this.#element);

    await this.#next(false);

    while (
      this.#containerHeight < this.#height + this.#padding * 2 &&
      !this.#forward.finished
    ) {
      await this.#next(false);
    }

    await this.#previous(false);

    requestAnimationFrame(() => {
      this.#render(false, -this.#backward.height + 48);

      requestAnimationFrame(() => {
        this.#scrollReader = createScrollReader(
          this.#element,
          (zooming) => {
            this.#render(zooming);
          },
          () => {
            return (
              (this.#width /
                (this.#height *
                  Math.max(this.#config.rowAspectRatioThreshold, 1))) *
              200
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
      this.#backward = new Section(
        result.previous !== null
          ? { key: result.previous, remainder: [] }
          : undefined,
        "backward",
        this.#config.rowAspectRatioThreshold,
        this.#width
      );
      this.#backward.attach(this.#element);
    }

    result.items.forEach(({ id }) => this.#keys.set(id, key));
    return result;
  }

  #render(zooming: boolean, offset: number | false = false, go = true) {
    if (go && offset !== false) {
      this.#forward.top = this.#backward.height;
      this.#backward.top = 0;
    }

    const top = this.#element.scrollTop - (offset === false ? 0 : offset);

    const backward = this.#backward.render(
      top + this.#height + this.#padding,
      (n) => n > top - this.#padding,
      zooming,
      this.#config.render,
      top + 48
    );

    const forward = this.#forward.render(
      top - this.#padding - this.#backward.height,
      (n) => {
        return n < top + this.#height + this.#padding - this.#backward.height;
      },
      zooming,
      this.#config.render,
      top - this.#backward.height + 48
    );

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
      this.#forward.top = this.#backward.height;
      this.#backward.top = 0;
    }

    if (offset !== false && top) {
      this.#element.scrollTo(0, top);
    }

    if (!zooming && backward.more) this.#previous();
    if (!zooming && forward.more) this.#next();
  }
}
