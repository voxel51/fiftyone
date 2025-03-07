import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { gridZoom } from "./recoil";

const WIDEST = 1200;
const WIDE = 1000;
const NORMAL = 800;

// Zoom value is 11 minus ideal aspect ratio
//   - min aspect ratio is 1 -> max zoom is 10
//   - min zoom is -4 -> max aspect ratio is 15
const FROM_ROW_ASPECT_RATIO = 11;
export const ZOOM_RANGE: [number, number] = [-4, 10];

/**
 * Convert an aspect ratio to a zoom setting
 *
 * @param {number} aspectRatio
 * @returns {number}
 */
export const zoomFromAspectRatio = (aspectRatio: number) =>
  aspectRatio - FROM_ROW_ASPECT_RATIO;

/**
 * Convert a zoom setting to an aspect ratio
 *
 * @param {number} zoom
 * @returns {number}
 */
const zoomToAspectRatio = (zoom: number) => FROM_ROW_ASPECT_RATIO - zoom;

/**
 * Determines a maximium aspect ratio threshold for grid rows based on the
 * container width. The smaller the container width, the smaller the maximum
 * aspect ratio to prevent a large number of items from rendering on screen
 */
export default () => {
  const zoom = useRecoilValue(gridZoom);
  return useCallback(
    (width: number) => {
      let min = 6;

      if (width >= WIDEST) {
        min = -4;
      } else if (width >= WIDE) {
        min = -2;
      } else if (width >= NORMAL) {
        min = 2;
      }

      return zoomToAspectRatio(Math.max(min, zoom));
    },
    [zoom]
  );
};
