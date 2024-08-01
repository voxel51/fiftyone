import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { gridZoom } from "./recoil";

export default () => {
  const zoom = useRecoilValue(gridZoom);
  return useCallback(
    (width: number) => {
      let min = 7;

      if (width >= 1200) {
        min = 0;
      } else if (width >= 1000) {
        min = 2;
      } else if (width >= 800) {
        min = 4;
      }

      return 11 - Math.max(min, zoom);
    },
    [zoom]
  );
};
