/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { TIMELINE_DRAWER_MAX_SIZE } from "@fiftyone/playback";

/**
 * Fraction of the surface height the timeline may occupy before its body caps
 * and scrolls internally — so a growing track list never crowds out the media.
 */
const TIMELINE_MAX_HEIGHT_FRACTION = 0.25;

/** Floor for the timeline body cap so it stays usable on a short surface. */
const TIMELINE_MIN_MAX_SIZE = 160;

/**
 * The timeline drawer's body cap for a surface of this height.
 *
 * Shared by the Annotate and Explore video surfaces so the two dock their
 * timelines identically by construction. They previously carried the same two
 * constants and the same nested `Math.min` / `Math.max` separately, which is
 * two places for the docking behaviour to drift apart.
 *
 * `undefined` while the surface has not been measured — the drawer then falls
 * back to its own default rather than briefly capping at the floor.
 *
 * @param surfaceHeight - Measured surface height in px; 0 before layout.
 */
export const useTimelineMaxSize = (
  surfaceHeight: number,
): number | undefined =>
  surfaceHeight
    ? Math.min(
        TIMELINE_DRAWER_MAX_SIZE,
        Math.max(
          TIMELINE_MIN_MAX_SIZE,
          Math.round(surfaceHeight * TIMELINE_MAX_HEIGHT_FRACTION),
        ),
      )
    : undefined;
