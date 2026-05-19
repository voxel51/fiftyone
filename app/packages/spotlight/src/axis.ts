/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Abstracts the two scroll orientations so layout code stays axis-agnostic.
 *
 * In **vertical** mode (the default) items tile into rows that stack downward;
 * the container scrolls via `scrollTop`. In **horizontal** mode items are placed
 * side-by-side and the container scrolls via `scrollLeft`, with each item filling
 * the full cross (height) dimension at a width proportional to its aspect ratio.
 */
export interface Axis {
  scrollPos(el: HTMLElement): number;
  scrollTo(el: HTMLElement, pos: number): void;
  primarySize(rect: DOMRect): number;
  crossSize(rect: DOMRect): number;
  /** CSS property used to position a section or row at its leading edge (e.g. `"top"` / `"left"`). */
  startAttr: "top" | "left";
  /** CSS property used to position a section or row at its trailing edge. */
  endAttr: "bottom" | "right";
  /** CSS property that sets the row's extent in the scroll direction (`"height"` / `"width"`). */
  primarySizeAttr: "height" | "width";
  /** CSS property that sets the row's extent perpendicular to scroll. */
  crossSizeAttr: "width" | "height";
  /** CSS property used to offset items along the cross axis within a row. */
  itemCrossAttr: "left" | "top";
  /** CSS property set to zero for items along the primary axis within a row. */
  itemPrimaryAttr: "top" | "left";
  /**
   * Size of a single item in the cross direction given the row's primary extent and the item's
   * aspect ratio. In vertical mode this is the item's width; in horizontal mode it is the height.
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
  primarySize: (r) => r.height,
  crossSize: (r) => r.width,
  startAttr: "top",
  endAttr: "bottom",
  primarySizeAttr: "height",
  crossSizeAttr: "width",
  itemCrossAttr: "left",
  itemPrimaryAttr: "top",
  itemCrossExtent: (rowExtent, ar) => rowExtent * ar,
  showDimensions: (rowExtent, ar) => [rowExtent * ar, rowExtent],
  tilingAR: (ar) => ar,
};

export const horizontalAxis: Axis = {
  scrollPos: (el) => el.scrollLeft,
  scrollTo: (el, n) => el.scrollTo(n, 0),
  primarySize: (r) => r.width,
  crossSize: (r) => r.height,
  startAttr: "left",
  endAttr: "right",
  primarySizeAttr: "width",
  crossSizeAttr: "height",
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
