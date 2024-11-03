import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { gridZoom } from "./recoil";

const WIDEST = 1200;
const WIDE = 1000;
const NORMAL = 800;

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

      return 11 - Math.max(min, zoom);
    },
    [zoom]
  );
};
