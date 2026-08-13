/**
 * Shared tuning for dwell-driven hover inspection, so every surface
 * (the 3D scene, the 2D projection overlay, future dwell-inspectable
 * content) inspects on the same rhythm.
 */

/** Pointer must rest this long before the hit test fires. */
export const POINT_HOVER_DWELL_MS = 150;

/** Movement beyond this while a result shows re-arms the dwell. */
export const POINT_HOVER_MOVE_TOLERANCE_PX = 4;
