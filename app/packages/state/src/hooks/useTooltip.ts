import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";

export default function useTooltip() {
  const setTooltipCoordinates = useSetRecoilState(fos.tooltipCoordinates);

  const setCoords = useCallback((coordinates: [number, number]) => {
    const coords = computeCoordinates(coordinates);
    setTooltipCoordinates(coords);
  }, []);

  return {
    setCoords,
  };
}

type placement = number | "unset";

export function computeCoordinates([x, y]: [number, number]): {
  bottom?: placement;
  top?: placement;
  left?: placement;
  right?: placement;
} {
  let top: placement = y,
    bottom: placement = "unset";
  if (y > window.innerHeight / 2) {
    bottom = window.innerHeight - y;
    top = "unset";
  }

  return {
    bottom,
    top,
    left: x <= window.innerWidth / 2 ? x + 24 : "unset",
    right: x > window.innerWidth / 2 ? window.innerWidth - x + 24 : "unset",
  };
}

export type ComputeCoordinatesReturnType = ReturnType<
  typeof computeCoordinates
>;
