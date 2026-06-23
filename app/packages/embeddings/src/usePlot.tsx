import { usePanelStatePartial } from "@fiftyone/spaces";
import { useViewChangeEffect } from "./useViewChangeEffect";
import { useSelectionEffect } from "./useSelectionEffect";
import useExtendedStageEffect from "./useExtendedStageEffect";

export function usePlot(_selection) {
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const [loadingPlot] = usePanelStatePartial("loadingPlot", true, true);

  useViewChangeEffect();
  useSelectionEffect();
  useExtendedStageEffect();

  return {
    ...(loadedPlot || {}),
    isLoading: loadingPlot,
  };
}
