/**
 * Copyright 2017-2024, Voxel51, Inc.
 */
import styles from "./styles.module.css";

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
) => (() => void) | undefined;

export default class Row<V> {
  #from: number;
  #hidden: boolean;

  readonly #container: HTMLDivElement = document.createElement("div");
  readonly #row: { item: ItemData<V>; element: HTMLDivElement }[];
  readonly #spacing: number;
  readonly #width: number;

  constructor(
    from: number,
    items: ItemData<V>[],
    spacing: number,
    width: number
  ) {
    this.#container.classList.add(styles.spotlightRow);
    this.#from = from;
    this.#width = width;

    this.#row = items.map((item) => {
      const element = document.createElement("div");
      element.style.top = "0px";

      this.#container.appendChild(element);
      return { element, item };
    });

    const height = this.height;
    let left = 0;

    for (const {
      element,
      item: { aspectRatio },
    } of this.#row) {
      const itemWidth = height * aspectRatio;

      element.style.height = `${height}px`;
      element.style.width = `${itemWidth}px`;
      element.style.left = `${left}px`;

      left += itemWidth + spacing;
    }

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
    return this.#width - (this.#row.length - 1) * this.#spacing;
  }

  get attached() {
    return Boolean(this.#container.parentElement);
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
        ? this.#container.classList.add(styles.spotlightRowHidden)
        : this.#container.classList.remove(styles.spotlightRowHidden);
      this.#hidden = hidden;
    }

    if (!this.attached) {
      this.#container.style[attr] = `${this.#from}px`;
      this.#container.style[attr === "bottom" ? "top" : "bottom"] = "unset";
      element.appendChild(this.#container);
    }

    if (this.#hidden) {
      return;
    }

    for (const { element, item } of this.#row) {
      const width = item.aspectRatio * this.height;
      render(item.id, element, [width, this.height], soft, hidden);
    }
  }
}
