import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { gridZoom } from "./recoil";

export default () => {
  const zoom = useRecoilValue(gridZoom);
  return useCallback(
    (width: number) => {
      let min = 1;

      if (width >= 1200) {
        min = -5;
      } else if (width >= 1000) {
        min = -3;
      } else if (width >= 800) {
        min = -1;
      }

      return 11 - Math.max(min, zoom);
    },
    [zoom]
  );
};
