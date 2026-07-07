import type { RenderSettings } from "./types";

// FiftyOne embeddings style: the Voxel51 orange (the app's default marker
// color) leads, so uncolored data renders solid orange. Hosts override
// per-point colors entirely via setColors().
export const PALETTE = ["#ffa500", "#19a7ce", "#9b5de5", "#02c39a", "#ef476f"];

/** Lasso stroke/fill color (the selection itself never recolors points) */
export const LASSO_COLOR = "#ffa500";

/** Point diameter in CSS px — constant at every zoom level */
export const POINT_SIZE = 6;

/** Weight of non-selected points while a selection is active */
export const DIM_ALPHA = 0.15;

/** Per-point alpha in "alpha" compositing mode */
export const BASE_ALPHA = 0.85;

/** Plot padding in CSS px (planar camera framing) */
export const MARGIN = 24;

/** Max planar zoom-in factor relative to the home view */
export const MAX_ZOOM = 50;

/** Pointer must sit still this long before a hover hit-test runs */
export const HOVER_DEBOUNCE_MS = 120;

/** Hover pick radius around the cursor, CSS px */
export const HOVER_RADIUS_PX = 8;

/** A press+release that travels no farther than this is a click, CSS px */
export const CLICK_SLOP_PX = 4;

export const DEFAULT_SETTINGS: RenderSettings = {
  mode: "density",
  gamma: 1,
  glow: 1,
  singleAlpha: 0.55,
};
