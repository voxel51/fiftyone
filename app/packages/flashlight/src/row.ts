/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { MARGIN } from "./constants";
import { spotlightRow, spotlightRowHidden } from "./styles.module.css";

export interface ItemData<V> {
  id?: symbol;
  aspectRatio: number;
  data: V;
}

export type Render = (
  id: symbol,
  element: HTMLDivElement,
  dimensions: [number, number],
  soft: boolean,
  disable: boolean
) => (() => void) | void;

export default class Row<V> {
  #hidden: boolean;

  #from: number;
  readonly #width: number;

  readonly #container: HTMLDivElement = document.createElement("div");
  readonly #row: { item: ItemData<V>; element: HTMLDivElement }[];

  constructor(items: ItemData<V>[], from: number, width: number) {
    this.#container.classList.add(spotlightRow);

    this.#row = items.map((item) => {
      const element = document.createElement("div");
      element.style.top = "0px";

      this.#container.appendChild(element);
      return { element, item };
    });

    this.#from = from;
    this.#width = width;
    const height = this.height;
    let left = 0;
    this.#row.forEach(({ element, item: { aspectRatio } }) => {
      const itemWidth = height * aspectRatio;

      element.style.height = `${height}px`;
      element.style.width = `${itemWidth}px`;
      element.style.left = `${left}px`;

      left += itemWidth + MARGIN;
    });

    this.#container.style.height = `${height}px`;
    this.#container.style.width = `${this.#width}px`;
  }

  get id() {
    return this.#row[0].item.id;
  }

  get from() {
    return this.#from;
  }

  set from(from: number) {
    this.#from = from;
  }

  get height() {
    return this.#cleanWidth / this.#cleanAspectRatio;
  }

  get width() {
    return this.#width;
  }

  get #cleanAspectRatio() {
    return this.#row
      .map(({ item }) => item.aspectRatio)
      .reduce((ar, next) => ar + next, 0);
  }

  get #cleanWidth() {
    return this.#width - (this.#row.length - 1) * MARGIN;
  }

  get attached() {
    return Boolean(this.#container.parentElement);
  }

  delete() {
    this.#row.forEach((f) => {
      delete f.item.data;
    });
  }

  hide(): void {
    if (!this.attached) {
      throw new Error("row is not attached");
    }

    this.#container.remove();
  }

  switch(attr) {
    this.#container.style[attr] = `${this.#from}px`;
    this.#container.style[attr === "bottom" ? "top" : "bottom"] = "unset";
  }

  show(
    element: HTMLDivElement,
    hidden: boolean,
    attr: "top" | "bottom",
    soft: boolean,
    render: Render
  ): void {
    if (hidden !== this.#hidden) {
      hidden
        ? this.#container.classList.add(spotlightRowHidden)
        : this.#container.classList.remove(spotlightRowHidden);
      this.#hidden = hidden;
    }

    if (!this.attached) {
      this.#container.style[attr] = `${this.#from}px`;
      this.#container.style[attr === "bottom" ? "top" : "bottom"] = "unset";
      element.appendChild(this.#container);
    }

    !this.#hidden &&
      this.#row.forEach(({ element, item }) => {
        const width = item.aspectRatio * this.height;
        render(item.id, element, [width, this.height], soft, hidden);
      });
  }
}
