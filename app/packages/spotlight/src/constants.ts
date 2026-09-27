/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export const BOTTOM = "bottom";
export const DATA_CY = "data-cy";

/** `data-cy` attribute values for the two section elements. */
export enum DATA_CY_SECTION {
  backward = "spotlight-section-backward",
  forward = "spotlight-section-forward",
}

/** Scroll direction of a {@link Section}: items grow downward (forward) or upward (backward). */
export enum DIRECTION {
  BACKWARD = "backward",
  FORWARD = "forward",
}

/** Default margin (px) used in layout calculations. */
export const DEFAULT_MARGIN = 8;

/** Default maximum number of rows a single {@link Section} may hold before it is swapped out. */
export const DEFAULT_MAX_ROWS = 80;

/** Default pixel gap between items and between rows. */
export const DEFAULT_SPACING = 3;

/** Default viewport padding (px) above and below the visible area used as a render buffer. */
export const DEFAULT_OFFSET = 48;

export const DIV = "div";
export const FIRST = "first";
export const FOUR = 4;
export const LAST = "last";

/** Minimum aspect-ratio threshold that the `rejected` event will recommend; prevents rows from becoming too tall. */
export const MIN_ASPECT_RATIO_RECOMMENDATION = 1.5;

export const ONE = 1;

/** Debounce delay (ms) before re-tiling after a container resize. */
export const RESIZE_TIMEOUT = 1000;

/** Width (px) reserved for the scrollbar so item layout does not overlap it. */
export const SCROLLBAR_WIDTH = 14;

/** Sentinel thrown by {@link Section} when a rapid sequence of clicks should be ignored. */
export const SLOW_DOWN = "slow down, you're clicking a lot";

export const THREE = 3;
export const TOP = "top";
export const TWO = 2;
export const UNSET = "unset";
export const ZERO = 0;

/** Scroll-speed threshold above which the grid enters "zooming" mode and suspends item rendering. */
export const ZOOMING_COEFFICIENT = 800;

/** Debounce delay (ms) before exiting zooming mode after fast scrolling stops. */
export const ZOOM_TIMEOUT = 250;
