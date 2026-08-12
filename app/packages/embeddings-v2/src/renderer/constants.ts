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

/**
 * How far non-selected points desaturate toward neutral gray while a
 * selection is active (0 = keep hue, 1 = fully gray). Weight alone
 * cannot carry the dimming: density accumulation sums weights, so a
 * deep pile of weight-cut points re-saturates to full opacity. Color
 * survives accumulation — the tone map averages it — so gray piles
 * stay visibly "not selected" at any depth.
 */
export const DIM_DESATURATION = 0.7;

/** The neutral the dimmed points desaturate toward (works on dark bg) */
export const DIM_TINT = 0.4;

/**
 * Extra diameter (CSS px) of the selection overlay's markers over the
 * base point size. Subjective — tune freely.
 */
export const EMPHASIS_SIZE_PX = 4;

/** Per-point alpha in "alpha" compositing mode */
export const BASE_ALPHA = 0.85;

/** Plot padding in CSS px (planar camera framing) */
export const MARGIN = 24;

/** Max planar zoom-in factor relative to the home view */
export const MAX_ZOOM = 50;

/**
 * Zoom level of the default view (first load and reset), measured like
 * the other zoom constants against the fit view (1 = fit). Slightly
 * out of fit, so the cloud lands with breathing room around it and pan
 * works immediately. Must stay above MIN_ZOOM.
 */
export const DEFAULT_ZOOM = 0.9;

/** Min planar zoom-out factor relative to the fit view. Defines the
 * camera's world (see worldRect) — the fixed pannable space every zoom
 * level is a window into — so any view above the floor has pan room,
 * and lassoing around the entire cloud has breathing room (FOEPD user
 * asks, 08-11) */
export const MIN_ZOOM = 0.55;

/** Pointer must sit still this long before a hover hit-test runs.
 * Short enough to feel live while gliding; it still gates the host's
 * per-hit sample-media fetches. */
export const HOVER_DEBOUNCE_MS = 50;

/** Hover pick radius around the cursor, CSS px. Comfortably past the
 * point's own 6px footprint, so hover engages on approach rather than
 * only once the cursor covers the point. */
export const HOVER_RADIUS_PX = 14;

/** A press+release that travels no farther than this is a click, CSS px */
export const CLICK_SLOP_PX = 4;

/** A drag whose bounding box is smaller than this encloses nothing anyone
 * meant to enclose: hand jitter during a click, not a lasso, CSS px */
export const LASSO_MIN_EXTENT_PX = 12;

export const DEFAULT_SETTINGS: RenderSettings = {
  mode: "density",
  gamma: 1,
  glow: 1,
  singleAlpha: 0.55,
};
