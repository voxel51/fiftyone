/**
 * Copyright 2017-2024, Voxel51, Inc.
 */
import { closest } from "./closest";
import { MARGIN } from "./constants";
import { EventCallback, Load, PageChange } from "./events";
import Row, { Render } from "./row";
import { Response, Section } from "./section";
import { flashlight } from "./styles.module.css";
import { createScrollReader } from "./zooming";

export { Load, PageChange } from "./events";
export { Response } from "./section";

export type Get<K> = (key: K) => Promise<Response<K>>;

export interface FlashlightConfig<K> {
  get: Get<K>;
  render: Render;
  key: K;
  rowAspectRatioThreshold: number;
}

export default class Flashlight<K> extends EventTarget {
  readonly #config: FlashlightConfig<K>;
  readonly #element = document.createElement("div");

  #scrollReader?: ReturnType<typeof createScrollReader>;

  #forward: Section<K>;
  #backward: Section<K>;

  readonly #keys = new Map<string, K>();
  #page: K;

  constructor(config: FlashlightConfig<K>) {
    super();
    this.#config = { ...config };

    this.#forward = new Section(this.#config.key);

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

    this.#fill();
  }

  detach(): void {
    if (!this.attached) {
      throw new Error("flashlight is not attached");
    }

    this.#element.parentElement.removeChild(this.#element);
  }

  get #backwardTop() {
    return this.#backward.height;
  }

  get #forwardBottom() {
    return this.#forward.height || MARGIN;
  }

  get #containerHeight() {
    return this.#forwardBottom + this.#backwardTop + 48;
  }

  get #height() {
    return this.#element.parentElement.getBoundingClientRect().height;
  }

  get #padding() {
    return this.#height * 0.75;
  }

  get #width() {
    return this.#element.getBoundingClientRect().width - 16;
  }

  async #fill() {
    const result = await this.#next();
    this.#backward.start = result.edge;
    this.#backward.end = this.#backward.start
      ? {
          remainder: [],
          key: this.#backward.start.key,
        }
      : undefined;

    while (this.#containerHeight < this.#height) {
      await this.#next();

      if (this.#backward.end && !this.#backward.end?.key) break;
    }

    let offset = 0;
    if (this.#backward.start) {
      offset = (await this.#previous()).offset;
    }

    requestAnimationFrame(() => {
      this.#scrollReader = createScrollReader(
        this.#element,
        (zooming) => this.#render(zooming),
        () => {
          return (
            (this.#width /
              (this.#height *
                Math.max(this.#config.rowAspectRatioThreshold, 1))) *
            300
          );
        }
      );

      this.#render(false, offset);

      this.dispatchEvent(new Load(this.#config.key));
    });
  }

  async #get(key: K) {
    const result = await this.#config.get(key);
    result.items.forEach(({ id }) => this.#keys.set(id, key));
    return result;
  }

  async #next() {
    const end = this.#forward.end;
    this.#forward.end = undefined;

    const data = await this.#get(end.key);
    const { rows, remainder } = this.#tile(
      [...end.remainder, ...data.items],
      this.#forwardBottom
    );
    this.#forward.end =
      data.next !== null
        ? {
            key: data.next,
            remainder,
          }
        : undefined;
    this.#forwardRows.push(...rows);

    let offset = 0;
    if (this.#forward.end && this.#forwardRows.length > 10) {
      const height =
        this.#forwardBottom -
        this.#forwardRows[this.#forwardRows.length - 1].height -
        MARGIN;
      this.#backwardRows = this.#forwardRows.reverse();
      this.#backwardRows.forEach((row) => (row.from = height - row.from));
      this.#backward = {
        start: this.#forward.start,
        end: { key: end.key, remainder: [] },
      };
      this.#forwardRows = [];
      this.#forward = {
        start: { key: data.next, remainder: [] },
        end: { key: data.next, remainder },
      };
    }

    return {
      edge: data.previous
        ? {
            key: data.previous,
            remainder: [],
          }
        : undefined,
      offset,
    };
  }

  async #previous() {
    const start = this.#backward.start;
    this.#backward.start = undefined;

    const data = await this.#get(start.key);
    const items = [...data.items, ...start.remainder].reverse();
    const { rows, remainder, offset } = this.#tile(
      items,
      this.#backwardTop,
      true
    );
    this.#backward.start =
      data.previous !== null
        ? {
            key: data.previous,
            remainder,
          }
        : undefined;
    this.#backwardRows.push(...rows);

    if (this.#backward.start && this.#backwardRows.length > 10) {
      this.#forwardRows = this.#backwardRows.reverse();
      this.#forward = {
        end: this.#backward.end,
        start: { key: start.key, remainder: [] },
      };
      this.#backwardRows = [];
      this.#backward = {
        start: { key: data.previous, remainder },
      };
    }

    return { offset };
  }

  #render(zooming: boolean, offset = 0) {
    const hide = this.#shown;

    hide.forEach((row) => row.hide());

    this.#shown = new Set();

    let bottom: number = undefined;
    let index: number = undefined;
    let top: number = undefined;

    let pageTop: number = undefined;
    let pageRow: Row = undefined;
    const scrollTop = this.#element.scrollTop + offset;

    const forward = closest(
      this.#forwardRows,
      this.#element.scrollTop + offset - this.#padding - this.#backwardTop,
      (row) => row.from
    );

    if (this.#backwardRows.length) {
      const backward = closest(
        this.#backwardRows,
        this.#backwardTop - (this.#element.scrollTop + offset - this.#padding),
        (row) => row.from + row.height
      );
      index = backward.index;

      if (
        index >= this.#backwardRows.length - 1 &&
        this.#backward.start?.key !== undefined
      ) {
        this.#previous().then(({ offset }) =>
          requestAnimationFrame(() => this.#render(false, offset))
        );
      }

      if (!forward || Math.abs(backward.delta) < Math.abs(forward.delta)) {
        top =
          this.#backwardTop -
          this.#backwardRows[index].from -
          this.#backwardRows[index].height;
        bottom = top + this.#height + this.#padding;
        while (top < bottom && index >= 0) {
          const row = this.#backwardRows[index];
          row.show(
            this.#backwardContainer,
            false,
            "bottom",
            zooming,
            this.#config.render
          );
          const next = top - scrollTop;
          if (next > 0 && (pageTop === undefined || next < pageTop)) {
            pageTop = next;
            pageRow = row;
          }
          top += row.height + MARGIN;
          this.#shown.add(row);
          index--;
        }
      }
    }

    if (forward) {
      index = forward.index;
      top = this.#backwardTop + this.#forwardRows[forward.index].from;
      bottom = scrollTop + this.#height + this.#padding;
      while (top < bottom && this.#forwardRows[index]) {
        const row = this.#forwardRows[index];
        row.show(
          this.#forwardContainer,
          false,
          "top",
          zooming,
          this.#config.render
        );
        top += row.height + MARGIN;

        const next = top - scrollTop;
        if (next > 0 && (pageTop === undefined || next < pageTop)) {
          pageTop = next;
          pageRow = row;
        }
        this.#shown.add(row);
        index++;
      }
    }

    if (
      (!forward || index >= this.#forwardRows.length - 1) &&
      this.#forward.end?.key !== undefined
    ) {
      this.#next().then(({ offset }) => {
        requestAnimationFrame(() => this.#render(false, offset));
      });
    }

    console.log(this.#forwardBottom);
    this.#forwardContainer.style.height = this.#forwardBottom + "px";
    this.#backwardContainer.style.height = this.#backwardTop + 48 + "px";
    this.#forwardContainer.parentElement.style.top =
      this.#backwardTop + 48 + "px";

    if (offset) {
      this.#scrollReader.adjust(offset);
    }

    const page = this.#keys.get(pageRow.id);

    if (!zooming && page !== this.#page) {
      this.#page = page;
      // this.dispatchEvent(new PageChange(page));
    }
  }
}
