import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { gridZoom } from "./recoil";

const WIDEST = 1200;
const WIDE = 1000;
const NORMAL = 800;

/**
 * Aspect ratio range is 1 to 15
 *
 *   - Smaller aspect ratio -> more zoom
 *   - Larger aspect ratio -> less zoom
 *
 * Zoom range is then -15 to -1 for the slider all the way to the right to mean
 * "max zoom"
 */
export const ZOOM_RANGE = [-15, -1];

/**
 * Determines a maximium aspect ratio threshold for grid rows based on the
 * container width. The smaller the container width, the smaller the maximum
 * aspect ratio to prevent a large number of items from rendering on screen
 */
export default () => {
  const zoom = useRecoilValue(gridZoom);
  return useCallback(
    (width: number) => {
      let min = -8;

      if (width >= WIDEST) {
        min = -15;
      } else if (width >= WIDE) {
        min = -13;
      } else if (width >= NORMAL) {
        min = -10;
      }

      return -Math.max(min, zoom);
    },
    [zoom]
  );
};
