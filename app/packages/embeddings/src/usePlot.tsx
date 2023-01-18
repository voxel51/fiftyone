import { usePanelStatePartial } from "@fiftyone/spaces";
import { useViewChangeEffect } from "./useViewChangeEffect";
import { useSelectionEffect } from "./useSelectionEffect";
import useExtendedStageEffect from "./useExtendedStageEffect";

export function usePlot({ clearSelection, setPlotSelection }) {
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null);
  const [loadingPlot] = usePanelStatePartial("loadingPlot", true);
  const [loadingPlotError] = usePanelStatePartial("loadingPlotError", null);

  useViewChangeEffect();
  useSelectionEffect();
  useExtendedStageEffect();

  return {
    ...(loadedPlot || {}),
    isLoading: loadingPlot,
    error: loadingPlotError,
  };
}
