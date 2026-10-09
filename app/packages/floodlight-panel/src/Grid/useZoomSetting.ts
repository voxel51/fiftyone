import type { Range } from "@fiftyone/state";
import { useCallback } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { SETTLE } from "../host/createHost";
import { useSettled } from "../host/useSettled";
import { gridZoom } from "./atoms";

/** Container width per unit of the widest row aspect ratio allowed. */
const WIDTH_PER_ASPECT = 80;
const MAX_ASPECT = 15;

/**
 * The widest row aspect ratio a container fits: narrower containers allow
 * fewer items per row, so tiles stay a usable size as the grid thins.
 */
export const maxRowAspect = (width: number) =>
  Math.min(MAX_ASPECT, Math.max(1, Math.floor(width / WIDTH_PER_ASPECT)));

/**
 * Aspect ratio range is 1 to 15
 *
 *   - Smaller aspect ratio -> more zoom
 *   - Larger aspect ratio -> less zoom
 *
 * Zoom range is then -15 to -1 for the slider all the way to the right to mean
 * "max zoom"
 */
export const ZOOM_RANGE: Range = [-15, -1];

/**
 * Determines a maximium aspect ratio threshold for grid rows based on the
 * container width. The smaller the container width, the smaller the maximum
 * aspect ratio to prevent a large number of items from rendering on screen
 */
/** The zoom once the slider rests, so a drag re-tiles once rather than per step. */
export const useSettledZoom = () =>
  useSettled(useReverbValue(gridZoom), SETTLE);

export default () => {
  const zoom = useSettledZoom();
  return useCallback(
    (width: number) => -Math.max(-maxRowAspect(width), zoom),
    [zoom],
  );
};
