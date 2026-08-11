/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Abstracts the two scroll orientations so layout code stays axis-agnostic.
 * Layout code refers only to the **primary** (scroll) axis and **cross**
 * (cross) axis; this module is the only place that maps those to concrete
 * CSS properties and `DOMRect` dimensions.
 *
 * In **vertical** mode (the default) the primary axis runs top-to-bottom and
 * the container scrolls via `scrollTop`. In **horizontal** mode the primary
 * axis runs left-to-right and the container scrolls via `scrollLeft`.
 */
export interface Axis {
  scrollPos(el: HTMLElement): number;
  scrollTo(el: HTMLElement, pos: number): void;
  /** Primary-axis size of a `DOMRect` (height in vertical mode, width in horizontal mode). */
  primaryExtent(rect: DOMRect): number;
  /** Cross-axis size of a `DOMRect` (width in vertical mode, height in horizontal mode). */
  crossExtent(rect: DOMRect): number;
  /** CSS property used to position a section or row at its leading edge (e.g. `"top"` / `"left"`). */
  startAttr: "top" | "left";
  /** CSS property used to position a section or row at its trailing edge. */
  endAttr: "bottom" | "right";
  /** CSS property that sets the row's extent along the primary axis (`"height"` / `"width"`). */
  primaryExtentAttr: "height" | "width";
  /** CSS property that sets the row's extent along the cross axis. */
  crossExtentAttr: "width" | "height";
  /** CSS property used to offset items along the cross axis within a row. */
  itemCrossAttr: "left" | "top";
  /** CSS property set to zero for items along the primary axis within a row. */
  itemPrimaryAttr: "top" | "left";
  /**
   * Size of a single item along the cross axis given the row's primary
   * extent and the item's aspect ratio. In vertical mode this is the item's
   * pixel width; in horizontal mode it is the pixel height.
   */
  itemCrossExtent(rowExtent: number, ar: number): number;
  /**
   * `[width, height]` dimensions to pass to `showItem`.
   * Always returns real pixel dimensions regardless of axis.
   */
  showDimensions(rowExtent: number, ar: number): [number, number];
  /**
   * Transforms an item's aspect ratio for tiling and extent calculations.
   * Identity in vertical mode; `1/ar` in horizontal mode so that item extents
   * are computed with `cleanCross / sum(tilingAR)` in both cases.
   */
  tilingAR(ar: number): number;
}

export const verticalAxis: Axis = {
  scrollPos: (el) => el.scrollTop,
  scrollTo: (el, n) => el.scrollTo(0, n),
  primaryExtent: (r) => r.height,
  crossExtent: (r) => r.width,
  startAttr: "top",
  endAttr: "bottom",
  primaryExtentAttr: "height",
  crossExtentAttr: "width",
  itemCrossAttr: "left",
  itemPrimaryAttr: "top",
  itemCrossExtent: (rowExtent, ar) => rowExtent * ar,
  showDimensions: (rowExtent, ar) => [rowExtent * ar, rowExtent],
  tilingAR: (ar) => ar,
};

export const horizontalAxis: Axis = {
  scrollPos: (el) => el.scrollLeft,
  scrollTo: (el, n) => el.scrollTo(n, 0),
  primaryExtent: (r) => r.width,
  crossExtent: (r) => r.height,
  startAttr: "left",
  endAttr: "right",
  primaryExtentAttr: "width",
  crossExtentAttr: "height",
  itemCrossAttr: "top",
  itemPrimaryAttr: "left",
  // item height = columnWidth / AR
  itemCrossExtent: (rowExtent, ar) => rowExtent / ar,
  // real dimensions: width = columnWidth, height = columnWidth / AR
  showDimensions: (rowExtent, ar) => [rowExtent, rowExtent / ar],
  tilingAR: (ar) => 1 / ar,
};

export const createAxis = (horizontal?: boolean): Axis =>
  horizontal ? horizontalAxis : verticalAxis;
