/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import styles from "./styles.module.css";

import { createAxis } from "./axis";
import type { Axis } from "./axis";
import { DIV, ONE, UNSET, ZERO } from "./constants";
import type Spotlight from "./index";
import type Iter from "./iter";
import type { Focus, ID, ItemData, Measure, SpotlightConfig } from "./types";
import { create, pixels } from "./utilities";

/**
 * A single horizontal row of items within a {@link Section}.
 *
 * The row lays out its items side-by-side at a height derived from the container
 * width and the combined aspect ratio of its items. Item elements are sized and
 * positioned in the constructor; visibility is managed via {@link show} / {@link hide}.
 */
export default class Row<K, V> {
  #from: number;

  readonly #aborter: AbortController = new AbortController();
  readonly #axis: Axis;
  readonly #config: SpotlightConfig<K, V>;
  /** True when this is the last row of the last page and may have fewer items than a full row. */
  readonly #dangle?: boolean;
  readonly #container: HTMLDivElement = create(DIV);
  readonly #row: { item: ItemData<K, V>; element: HTMLDivElement }[];
  readonly #crossExtent: number;

  /**
   * @param config - Shared grid configuration.
   * @param dangle - `true` for the final row of the last page; triggers special aspect-ratio handling.
   * @param focus - Sets the focused item when clicked.
   * @param from - Top offset (px) of this row within its section container.
   * @param items - The items that belong to this row.
   * @param iter - Iterator passed to `onItemClick` so handlers can navigate to adjacent items.
   * @param width - Container width (px) used to compute item dimensions.
   */
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
    this.#axis = createAxis(config.horizontal);
    this.#config = config;
    this.#dangle = dangle;
    this.#container.classList.add(styles.spotlightRow);
    this.#from = from;
    this.#crossExtent = width;

    this.#row = items.map((item) => {
      const element = create(DIV);
      element.style[this.#axis.itemPrimaryAttr] = pixels(ZERO);

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

    const extent = this.primaryExtent;
    let crossOffset = ZERO;

    for (const {
      element,
      item: { aspectRatio },
    } of this.#row) {
      const itemCross = this.#axis.itemCrossExtent(extent, aspectRatio);

      element.style[this.#axis.primarySizeAttr] = pixels(extent);
      element.style[this.#axis.crossSizeAttr] = pixels(itemCross);
      element.style[this.#axis.itemCrossAttr] = pixels(crossOffset);

      crossOffset += itemCross + config.spacing;
    }

    this.#container.style[this.#axis.primarySizeAttr] = pixels(extent);
    this.#container.style[this.#axis.crossSizeAttr] = pixels(this.#crossExtent);
  }

  /** True when the row container is currently in the DOM. */
  get attached() {
    return Boolean(this.#container.parentElement);
  }

  /** ID of the first item in this row. */
  get first() {
    return this.#row[ZERO].item.id;
  }

  /** Top offset (px) of this row within its section container. */
  get from() {
    return this.#from;
  }

  set from(from: number) {
    this.#from = from;
  }

  /** Extent of this row along the primary (scroll) axis — row height in vertical mode, column width in horizontal. */
  get primaryExtent() {
    return this.#cleanWidth / this.#cleanAspectRatio;
  }

  /** ID of the last item in this row. */
  get last() {
    return this.#row[this.#row.length - ONE].item.id;
  }

  /** Total byte size of all rendered items in this row; only valid when `getItemSizeBytes` is configured. */
  get sizeBytes() {
    let size = ZERO;
    for (const item of this.#row)
      size += this.#config.getItemSizeBytes(item.item.id);
    return size;
  }

  /** Calls `detachItem` for each item and aborts all event listeners. */
  destroy() {
    for (const { item } of this.#row) {
      this.#config.detachItem(item.id);
    }
    this.#aborter.abort();
  }

  /** Returns `true` if the item with the given description string is in this row. */
  has(item: string) {
    for (const i of this.#row) {
      if (i.item.id.description === item) {
        return true;
      }
    }
    return false;
  }

  /** Calls `hideItem` for each item and removes the row container from the DOM. */
  hide(): void {
    for (const { item } of this.#row) {
      this.#config.hideItem({ id: item.id });
    }

    this.#container.remove();
  }

  /**
   * Appends the row container to `element` (if not already attached), positions it
   * via `attr` (top or bottom), and calls `showItem` for each item.
   *
   * @param attr - CSS property used for positioning: `"top"` for forward rows, `"bottom"` for backward.
   * @param element - The section container to append into.
   * @param measure - Optional byte-size tracker; called with each item and its size promise.
   * @param spotlight - The owning {@link Spotlight} instance passed through to `showItem`.
   * @param zooming - `true` while the user is fast-scrolling; passed through to `showItem`.
   */
  show({
    attr,
    element,
    measure,
    spotlight,
    zooming,
  }: {
    attr: string;
    element: HTMLDivElement;
    measure?: Measure<K, V>;
    spotlight: Spotlight<K, V>;
    zooming: boolean;
  }) {
    if (!this.attached) {
      this.#container.style[attr] = `${this.#from}px`;
      const opposite =
        attr === this.#axis.startAttr
          ? this.#axis.endAttr
          : this.#axis.startAttr;
      this.#container.style[opposite] = UNSET;
      element.appendChild(this.#container);
    }

    const extent = this.primaryExtent;
    for (const { element, item } of this.#row) {
      if (this.#aborter.signal.aborted) {
        return;
      }

      const bytes = this.#config.showItem({
        id: item.id,
        dimensions: this.#axis.showDimensions(extent, item.aspectRatio),
        element,
        spotlight,
        zooming,
      });
      measure?.(item, bytes);
    }
  }

  /**
   * Updates the row's CSS position without re-appending it.
   * Called after a section direction reversal to flip start ↔ end.
   * @param attr - The CSS property to set: `"top"`, `"bottom"`, `"left"`, or `"right"`.
   */
  switch(attr: string) {
    this.#container.style[attr] = `${this.#from}px`;
    const opposite =
      attr === this.#axis.startAttr ? this.#axis.endAttr : this.#axis.startAttr;
    this.#container.style[opposite] = UNSET;
  }

  /** Calls `updater` for every item ID in this row. */
  updateItems(updater: (id: ID) => void) {
    for (const row of this.#row) updater(row.item.id);
  }

  /**
   * Combined aspect ratio of items in this row, adjusted for dangle rows.
   * Dangle rows with uniform items extend to the threshold; others use the threshold as a floor.
   */
  get #cleanAspectRatio() {
    const result = this.#row
      .map(({ item }) => this.#axis.tilingAR(item.aspectRatio))
      .reduce((ar, next) => ar + next, ZERO);
    if (this.#dangle) {
      const ar = this.#singleAspectRatio;
      if (ar !== null) {
        return this.#dangleSingleAspectRatioCount * ar;
      }

      const target = this.#config.rowAspectRatioThreshold(this.#crossExtent);
      return result > target ? result : target;
    }

    return result;
  }

  /**
   * Effective width available to items, accounting for spacing gaps.
   * Dangle rows with uniform items use the virtual extended item count.
   */
  get #cleanWidth() {
    if (!this.#dangle || this.#singleAspectRatio === null) {
      return this.#crossExtent - (this.#row.length - ONE) * this.#config.spacing;
    }

    return (
      this.#crossExtent -
      (this.#dangleSingleAspectRatioCount - ONE) * this.#config.spacing
    );
  }

  /**
   * For uniform-aspect-ratio dangle rows, the number of virtual items needed
   * to reach the row aspect ratio threshold. Used to compute a natural item size
   * even though fewer actual items are present.
   */
  get #dangleSingleAspectRatioCount() {
    const ar = this.#axis.tilingAR(this.#row[ZERO].item.aspectRatio);
    const target = this.#config.rowAspectRatioThreshold(this.#crossExtent);

    let count = ONE;
    let result = ar;
    while (result < target) {
      count++;
      result += ar;
    }

    return count;
  }

  /**
   * Returns the shared aspect ratio if all items in this row are identical, or `null` if mixed.
   * Used to detect uniform dangle rows and apply the virtual-count sizing path.
   */
  get #singleAspectRatio() {
    const set = new Set(
      this.#row.map(({ item }) => this.#axis.tilingAR(item.aspectRatio))
    );
    return set.size === ONE
      ? this.#axis.tilingAR(this.#row[ZERO].item.aspectRatio)
      : null;
  }
}
