import { useCallback } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { gridZoom, gridZoomMin } from "./recoil";

const WIDEST = 1200;
const WIDE = 1000;
const NORMAL = 800;

/**
 * Determines a maximium aspect ratio threshold for grid rows based on the
 * container width. The smaller the container width, the smaller the maximum
 * aspect ratio to prevent a large number of items from rendering on screen
 */
export default () => {
  const zoom = useRecoilValue(gridZoom);
  const [minimum, setMinimum] = useRecoilState(gridZoomMin);
  return {
    threshold: useCallback(
      (width: number) => {
        let min = 6;

        if (width >= WIDEST) {
          min = -4;
        } else if (width >= WIDE) {
          min = -2;
        } else if (width >= NORMAL) {
          min = 2;
        }

        return 11 - Math.max(minimum ?? min, zoom);
      },
      [minimum, zoom]
    ),
    setMinimum,
  };
};
