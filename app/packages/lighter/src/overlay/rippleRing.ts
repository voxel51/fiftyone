/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure render helper for the keypoint ripple animation.
 *
 * Draws a series of staggered rings expanding outward from `center`. Knows
 * nothing about which points should ripple, when to start, or when to stop —
 * the caller owns that lifecycle and is responsible for invalidating the
 * frame each tick (e.g. via `requestAnimationFrame` + `markDirty`).
 */

import {
  KEYPOINT_RADIUS,
  RIPPLE_CYCLE_MS,
  RIPPLE_LINE_WIDTH,
  RIPPLE_MAX_RADIUS,
  RIPPLE_PEAK_OPACITY,
  RIPPLE_RING_COUNT,
} from "../constants";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point } from "../types";

export interface DrawRippleRingsArgs {
  renderer: Renderer2D;
  center: Point;
  color: string;
  /** Milliseconds since the ripple started; controls the cycle position. */
  elapsedMs: number;
  containerId: string;
}

/**
 * Draws the ripple rings for a single point. Pass screen-pixel radii — the
 * renderer divides by viewport scale internally so the rings stay a constant
 * size on screen across zoom levels.
 */
export const drawRippleRings = ({
  renderer,
  center,
  color,
  elapsedMs,
  containerId,
}: DrawRippleRingsArgs): void => {
  const cycleProgress = (elapsedMs % RIPPLE_CYCLE_MS) / RIPPLE_CYCLE_MS;

  for (let ring = 0; ring < RIPPLE_RING_COUNT; ring++) {
    const ringProgress = (cycleProgress - ring / RIPPLE_RING_COUNT + 1) % 1;
    // Ease-out cubic — fast start, slow finish.
    const eased = 1 - Math.pow(1 - ringProgress, 3);
    const radius = KEYPOINT_RADIUS + eased * RIPPLE_MAX_RADIUS;
    const opacity = (1 - eased) * RIPPLE_PEAK_OPACITY;

    if (opacity <= 0.01) continue;

    renderer.drawPoint(
      center,
      radius,
      { strokeStyle: color, lineWidth: RIPPLE_LINE_WIDTH, opacity },
      containerId,
    );
  }
};
