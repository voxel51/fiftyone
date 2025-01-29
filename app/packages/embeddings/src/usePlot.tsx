import { usePanelStatePartial } from "@fiftyone/spaces";
import { useViewChangeEffect } from "./useViewChangeEffect";
import { useSelectionEffect } from "./useSelectionEffect";
import useExtendedStageEffect from "./useExtendedStageEffect";

export function usePlot({ clearSelection, setPlotSelection }) {
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const [augmentedPlot] = usePanelStatePartial("augmentedPlot", null, true);
  const [loadingPlot] = usePanelStatePartial("loadingPlot", true, true);
  const [loadingPlotError] = usePanelStatePartial(
    "loadingPlotError",
    null,
    true
  );

  const combinedPlot = combineLoadedPlots(loadedPlot, augmentedPlot);

  useViewChangeEffect();
  useSelectionEffect();
  useExtendedStageEffect();

  return {
    ...(combinedPlot || {}),
    isLoading: loadingPlot,
    error: loadingPlotError,
  };
}

type PointData = {
  id: string;
  points: [number, number];
  label: string | null;
  sample_id: string;
  selected: boolean;
};

type LoadedPlot = {
  traces: {
    [key: string]: PointData[];
  };
};
function combineLoadedPlots(
  loadedPlot: LoadedPlot,
  augmentedPlot: LoadedPlot
): LoadedPlot {
  console.log({
    loadedPlot,
    augmentedPlot,
  });

  if (loadedPlot && !augmentedPlot) {
    return loadedPlot;
  }
  if (!loadedPlot || !augmentedPlot) {
    return null;
  }
  return {
    ...loadedPlot,
    traces: combineTraces(loadedPlot?.traces, augmentedPlot?.traces),
  };
}

function combineTraces(
  a: { [key: string]: PointData[] },
  b: { [key: string]: PointData[] }
) {
  if (!a) {
    return null;
  }
  if (!b) return a;
  return Object.keys(a).reduce((acc, key) => {
    return {
      ...acc,
      [key]: combineTrace(a[key], b[key]),
    };
  }, {});
}

function combineTrace(a: PointData[], b: PointData[]) {
  if (!a) {
    return [];
  }
  if (!b) {
    return a;
  }
  return [...a, ...b];
}
