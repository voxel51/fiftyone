import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useSetReverbState } from "@fiftyone/reverb";
import { computeCoordinates } from "./useTooltip.utils";

export type { ComputeCoordinatesReturnType } from "./useTooltip.utils";

export default function useTooltip() {
  const setTooltipCoordinates = useSetReverbState(fos.tooltipCoordinates);

  const setCoords = useCallback((coordinates: [number, number]) => {
    const coords = computeCoordinates(coordinates);
    setTooltipCoordinates(coords);
  }, []);

  return {
    setCoords,
  };
}
