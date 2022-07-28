import { FlashlightOptions } from "@fiftyone/flashlight";
import { useCallback, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { gridZoom, gridZoomRange } from "./recoil";

export default () => {
  let zoom = useRecoilValue(gridZoom);
  const setZoomRange = useSetRecoilState(gridZoomRange);
  const resize = useCallback(
    (width: number): FlashlightOptions => {
      let min = 7;

      if (width >= 1200) {
        min = 0;
      } else if (width >= 1000) {
        min = 2;
      } else if (width >= 800) {
        min = 4;
      }

      zoom = Math.max(min, zoom);
      setZoomRange([min, 10] as [number, number]);
      return {
        rowAspectRatioThreshold: 11 - zoom,
      };
    },
    [zoom]
  );
  const ref = useRef(resize);
  ref.current = resize;

  return ref;
};
