import type { Camera } from "three";

/** One embedding point as delivered by the host application */
export interface EmbeddingPoint {
  id: string;
  x: number;
  y: number;
  /**
   * Optional third coordinate. Ignored (the data renders flat) unless
   * the host supplies a zCamera adapter for it.
   */
  z?: number;
  label: string | null;
}

/**
 * Compositing mode + tone-map tuning, applied live.
 *
 * - "density": two-pass accumulate-then-tone-map — order-independent,
 *   single outliers stay visible, piles saturate and glow
 * - "alpha": classic src-alpha compositing straight to the canvas
 * - "opaque": depth test + write — real occlusion; dimming darkens
 *   instead of fading, and singleAlpha doubles as per-point opacity
 */
export interface RenderSettings {
  mode: "density" | "alpha" | "opaque";
  /** Density tone-map curve; pivots at d=1 so lone points never change */
  gamma: number;
  /** 0..1 scale on the toward-white glow of dense piles (density only) */
  glow: number;
  /** Alpha of an isolated point (density) / point opacity (opaque) */
  singleAlpha: number;
}

/** One hovered or clicked point, reported through the chart's callbacks */
export interface HoverHit {
  index: number;
  id: string;
  label: string;
  /** The point's projected position in CSS px relative to the container */
  x: number;
  y: number;
}

/** Screen-space polygon, CSS px */
export type Polygon = Array<[number, number]>;

/**
 * Visibility as membership in a SHARED per-point cell-ordinal array: point
 * `i` is visible when `ordinals[i] === ordinal`. A facet layout passes one
 * ordinal array to every cell instead of allocating a per-cell n-sized
 * mask; the chart fills its own GPU-side mask from it directly.
 */
export interface CellMembership {
  ordinals: Int16Array;
  ordinal: number;
}

/**
 * Who owns a plain drag: "select" draws the lasso (the default),
 * "explore" gives it to the camera. Modified gestures (wheel zoom,
 * shift/middle-drag pan) work in both modes.
 */
export type InteractionMode = "explore" | "select";

/**
 * Everything the chart needs from a camera: a three.js camera kept
 * current, framing/reset driven by data bounds, and the gesture split
 * (which pointer-down starts a lasso vs. a camera drag).
 */
export interface CameraAdapter {
  readonly camera: Camera;
  /** Frame the camera on new data bounds; also becomes the reset target
   * and clears any focus (new data, stale focus) */
  setBounds(bounds: Bounds, width: number, height: number): void;
  resize(width: number, height: number): void;
  reset(): void;
  /**
   * Direct the camera's attention to a sub-region — the bounds of the
   * currently visible points: reset() re-frames to the focus instead
   * of the full data bounds, and orbit-style cameras move their pivot
   * there. Must never yank the current view. Null restores full-data
   * attention (everything visible). Optional; adapters without it keep
   * full-bounds framing.
   */
  setFocus?(bounds: Bounds | null): void;
  /** True when this pointer-down should draw a lasso, not move the camera */
  isLassoStart(event: PointerEvent): boolean;
  /** Adopt an interaction mode; adapters without modes may omit this */
  setMode?(mode: InteractionMode): void;
  /**
   * Converts a screen-space polygon (CSS px) to data-space vertices,
   * when the projection makes that well-defined — hosts send the tiny
   * data polygon to a server instead of materializing selection ids.
   * Adapters without an exact mapping return null.
   */
  toDataPolygon?(polygon: Polygon): Array<[number, number]> | null;
  destroy(): void;
}

/**
 * Builds a camera adapter — the chart's extension seam for alternative
 * cameras. `onChange` must fire whenever the camera moves so the chart
 * can re-render and re-test hover.
 */
export type CameraAdapterFactory = (
  container: HTMLElement,
  onChange: () => void,
) => CameraAdapter;

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}
