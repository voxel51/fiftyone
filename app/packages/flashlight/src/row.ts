/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

import { MARGIN } from "./constants";
import {
  flashlightSection,
  flashlightSectionHidden,
} from "./styles.module.css";

export interface ItemData {
  id?: string;
  aspectRatio: number;
}

export type Render = (
  id: string,
  element: HTMLDivElement,
  dimensions: [number, number],
  soft: boolean,
  disable: boolean
) => (() => void) | void;

export default class Row {
  #attached = false;
  #top: number;
  #width: number;
  #hidden: boolean;
  readonly index: number;
  readonly itemIndex: number;
  readonly #section: HTMLDivElement = document.createElement("div");
  readonly #row: { item: ItemData; element: HTMLDivElement }[];

  constructor(items: ItemData[]) {
    this.#section.classList.add(flashlightSection);

    this.#row = items.map((item) => {
      const element = document.createElement("div");
      element.style.top = "0px";

      this.#section.appendChild(element);
      return { element, item };
    });
  }

  // no margins
  get cleanAspectRatio() {
    return this.#row
      .map(({ item }) => item.aspectRatio)
      .reduce((ar, next) => ar + next, 0);
  }

  // no margins
  get #cleanWidth() {
    return this.#width - (this.#row.length - 1) * MARGIN;
  }

  get height() {
    return this.#cleanWidth / this.cleanAspectRatio;
  }

  getItems() {
    return this.#row.map(({ item }) => item).flat();
  }

  set(top: number, width: number) {
    if (this.#top !== top) {
      const setting = `${top}px`;

      this.#section.style.top = setting;

      this.#top = top;
    }

    if (this.#width !== width) {
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

      this.#section.style.height = `${height}px`;
      this.#section.style.width = `${width}px`;
    }
  }

  getBottom() {
    return this.#top + this.height;
  }

  getTop() {
    return this.#top;
  }

  hide(): void {
    if (this.#attached) {
      this.#section.remove();
      this.#attached = false;
    }
  }

  isShown() {
    return this.#attached;
  }

  show(
    element: HTMLDivElement,
    hidden: boolean,
    soft: boolean,
    render: Render
  ): void {
    if (hidden !== this.#hidden) {
      hidden
        ? this.#section.classList.add(flashlightSectionHidden)
        : this.#section.classList.remove(flashlightSectionHidden);
      this.#hidden = hidden;
    }

    if (!this.#attached) {
      element.appendChild(this.#section);
      this.#attached = true;
    }

    !this.#hidden &&
      this.#row.forEach(({ element, item }) => {
        const width = this.height * item.aspectRatio;

        render(item.id, element, [width, this.height], soft, false);
      });
  }
}
