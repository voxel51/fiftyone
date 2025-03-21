/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import styles from "./styles.module.css";

import { BOTTOM, DIV, ONE, TOP, UNSET, ZERO } from "./constants";
import type Spotlight from "./index";
import type Iter from "./iter";
import type { Focus, ID, ItemData, Measure, SpotlightConfig } from "./types";
import { create, pixels } from "./utilities";

export default class Row<K, V> {
  #from: number;

  readonly #aborter: AbortController = new AbortController();
  readonly #config: SpotlightConfig<K, V>;
  readonly #dangle?: boolean;
  readonly #container: HTMLDivElement = create(DIV);
  readonly #row: { item: ItemData<K, V>; element: HTMLDivElement }[];
  readonly #width: number;

  constructor({
    config,
    dangle,
    from,
    focus,
    items,
    iter,
    width,
  }: {
    config: SpotlightConfig<K, V>;
    dangle: boolean;
    focus: Focus;
    from: number;
    items: ItemData<K, V>[];
    iter: Iter<K, V>;
    width: number;
  }) {
    this.#config = config;
    this.#dangle = dangle;
    this.#container.classList.add(styles.spotlightRow);
    this.#from = from;
    this.#width = width;

    this.#row = items.map((item) => {
      const element = create(DIV);
      element.style.top = pixels(ZERO);

      if (config.onItemClick) {
        const handler = (event: MouseEvent) => {
          if (event.metaKey || event.shiftKey || event.ctrlKey) {
            return;
          }

          event.preventDefault();
          focus(item.id);
          config.onItemClick({
            event,
            item,
            iter,
          });
        };

        element.addEventListener("click", handler, {
          signal: this.#aborter.signal,
        });
        element.addEventListener("contextmenu", handler, {
          signal: this.#aborter.signal,
        });
      }

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

      left += itemWidth + config.spacing;
    }

    this.#container.style.height = pixels(height);
    this.#container.style.width = pixels(this.#width);
  }

  get attached() {
    return Boolean(this.#container.parentElement);
  }

  get first() {
    return this.#row[ZERO].item.id;
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

  get last() {
    return this.#row[this.#row.length - ONE].item.id;
  }

  get sizeBytes() {
    let size = ZERO;
    for (const item of this.#row)
      size += this.#config.getItemSizeBytes(item.item.id);
    return size;
  }

  destroy() {
    for (const { item } of this.#row) {
      this.#config.detachItem(item.id);
    }
    this.#aborter.abort();
  }

  has(item: string) {
    for (const i of this.#row) {
      if (i.item.id.description === item) {
        return true;
      }
    }
    return false;
  }

  hide(): void {
    for (const { item } of this.#row) {
      this.#config.hideItem({ id: item.id });
    }

    this.#container.remove();
  }

  show({
    attr,
    element,
    measure,
    spotlight,
    zooming,
  }: {
    attr: typeof BOTTOM | typeof TOP;
    element: HTMLDivElement;
    measure?: Measure<K, V>;
    spotlight: Spotlight<K, V>;
    zooming: boolean;
  }) {
    if (!this.attached) {
      this.#container.style[attr] = `${this.#from}px`;
      this.#container.style[attr === BOTTOM ? TOP : BOTTOM] = UNSET;
      element.appendChild(this.#container);
    }

    for (const { element, item } of this.#row) {
      const width = item.aspectRatio * this.height;
      if (this.#aborter.signal.aborted) {
        return;
      }

      const bytes = this.#config.showItem({
        id: item.id,
        dimensions: [width, this.height],
        element,
        spotlight,
        zooming,
      });
      measure?.(item, bytes);
    }
  }

  switch(attr) {
    this.#container.style[attr] = `${this.#from}px`;
    this.#container.style[attr === BOTTOM ? TOP : BOTTOM] = UNSET;
  }

  updateItems(updater: (id: ID) => void) {
    for (const row of this.#row) updater(row.item.id);
  }

  get #cleanAspectRatio() {
    const result = this.#row
      .map(({ item }) => item.aspectRatio)
      .reduce((ar, next) => ar + next, ZERO);
    if (this.#dangle) {
      const ar = this.#singleAspectRatio;
      if (ar !== null) {
        return this.#dangleSingleAspectRatioCount * ar;
      }

      const target = this.#config.rowAspectRatioThreshold(this.#width);
      return result > target ? result : target;
    }

    return result;
  }

  get #cleanWidth() {
    if (!this.#dangle || this.#singleAspectRatio === null) {
      return this.#width - (this.#row.length - ONE) * this.#config.spacing;
    }

    return (
      this.#width -
      (this.#dangleSingleAspectRatioCount - ONE) * this.#config.spacing
    );
  }

  get #dangleSingleAspectRatioCount() {
    const ar = this.#row[ZERO].item.aspectRatio;
    const target = this.#config.rowAspectRatioThreshold(this.#width);

    let count = ONE;
    let result = ar;
    while (result < target) {
      count++;
      result += ar;
    }

    return count;
  }

  get #singleAspectRatio() {
    const set = new Set(this.#row.map(({ item }) => item.aspectRatio));
    return set.size === ONE ? this.#row[ZERO].item.aspectRatio : null;
  }
}
