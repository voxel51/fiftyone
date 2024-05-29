/**
 * Copyright 2017-2024, Voxel51, Inc.
 */
import { BOTTOM, DIV, ONE, TOP, UNSET, ZERO } from "./constants";
import styles from "./styles.module.css";
import { create, pixels } from "./utilities";

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
) => void;

export default class Row<V> {
  #from: number;
  #hidden: boolean;

  readonly #container: HTMLDivElement = create(DIV);
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
    this.#spacing = spacing;
    this.#width = width;

    this.#row = items.map((item) => {
      const element = create(DIV);
      element.style.top = pixels(ZERO);

      this.#container.appendChild(element);
      return { element, item };
    });

    const height = this.height;
    let left = ZERO;

    for (const {
      element,
      item: { aspectRatio },
    } of this.#row) {
      const itemWidth = height * aspectRatio;

      element.style.height = pixels(height);
      element.style.width = pixels(itemWidth);
      element.style.left = pixels(left);

      left += itemWidth + spacing;
    }

    this.#container.style.height = pixels(height);
    this.#container.style.width = pixels(this.#width);
  }

  get attached() {
    return Boolean(this.#container.parentElement);
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

  get id() {
    return this.#row[ZERO].item.id;
  }

  get width() {
    return this.#width;
  }

  hide(): void {
    if (!this.attached) {
      throw new Error("row is not attached");
    }

    this.#container.remove();
  }

  show(
    element: HTMLDivElement,
    hidden: boolean,
    attr: typeof BOTTOM | typeof TOP,
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
      this.#container.style[attr === BOTTOM ? TOP : BOTTOM] = UNSET;
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

  switch(attr) {
    this.#container.style[attr] = `${this.#from}px`;
    this.#container.style[attr === BOTTOM ? TOP : BOTTOM] = UNSET;
  }

  updateItems(updater: (id: symbol) => void) {
    for (const row of this.#row) updater(row.item.id);
  }

  get #cleanAspectRatio() {
    return this.#row
      .map(({ item }) => item.aspectRatio)
      .reduce((ar, next) => ar + next, ZERO);
  }

  get #cleanWidth() {
    return this.#width - (this.#row.length - ONE) * this.#spacing;
  }
}
