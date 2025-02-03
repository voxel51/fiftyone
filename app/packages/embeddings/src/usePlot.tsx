import { usePanelStatePartial } from "@fiftyone/spaces";
import { useViewChangeEffect } from "./useViewChangeEffect";
import { useSelectionEffect } from "./useSelectionEffect";
import useExtendedStageEffect from "./useExtendedStageEffect";
import useCurrentPlotWindow, { PlotBounds } from "./useCurrentPlotWindow";
import { useMemo } from "react";

export function usePlot({ clearSelection, setPlotSelection }, plotSize) {
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const [augmentedPlot] = usePanelStatePartial("augmentedPlot", null, true);
  const [loadingPlot] = usePanelStatePartial("loadingPlot", true, true);
  const [loadingPlotError] = usePanelStatePartial(
    "loadingPlotError",
    null,
    true
  );

  const currentPlotWindow = useCurrentPlotWindow();
  useViewChangeEffect();
  useSelectionEffect();
  useExtendedStageEffect();

  if (!loadedPlot) {
    return {
      isLoading: true,
    };
  }

  const screenSize: [number, number] = [
    plotSize?.width as number,
    plotSize?.height as number,
  ];
  const combinedPlot = combineLoadedPlots(
    loadedPlot,
    augmentedPlot,
    currentPlotWindow.bounds,
    screenSize
  );

  const plotBounds =
    currentPlotWindow.bounds || computePlotBoundsForTraces(combinedPlot.traces);

  // TODO: memoize this
  const finalTraces = cullTracesByOcclusion(
    combinedPlot.traces,
    plotBounds,
    screenSize
  );

  return {
    ...combinedPlot,
    // traces: finalTraces,
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
  augmentedPlot: LoadedPlot,
  bounds: PlotBounds,
  screenSize: [number, number]
): LoadedPlot {
  console.log({
    loadedPlot,
    augmentedPlot,
  });

  console.log("screenSize", screenSize);

  if (loadedPlot && !augmentedPlot) {
    return {
      ...loadedPlot,
      traces: combineTraces(loadedPlot?.traces, {}),
    };
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

function computePlotBoundsForTraces(traces: {
  [key: string]: PointData[];
}): PlotBounds {
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let minY = Infinity;

  Object.values(traces).forEach((trace) => {
    trace.forEach((point) => {
      const [x, y] = point.points;
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    });
  });

  return {
    a: [minX, minY],
    b: [maxX, maxY],
  };
}

function cullTracesByOcclusion(
  traces: { [key: string]: PointData[] },
  bounds: PlotBounds,
  screenSize: [number, number]
) {
  const culledTraces: { [key: string]: PointData[] } = {};

  Object.entries(traces).forEach(([key, trace]) => {
    culledTraces[key] = cullPointsByOcclusion(trace, bounds, screenSize);
  });

  return culledTraces;
}

function cullPointsByOcclusion(
  trace: PointData[],
  bounds: PlotBounds,
  screenSize: [number, number],
  gridSize = 10
) {
  const culledPoints: PointData[] = [];
  const occupiedCells = new Set<string>();
  const [screenWidth, screenHeight] = screenSize;

  const [xMin, yMin] = bounds.a;
  const [xMax, yMax] = bounds.b;

  trace.forEach((point) => {
    const [x, y] = point.points;

    // normalize points
    const normX = (x - xMin) / (xMax - xMin);
    const normY = (y - yMin) / (yMax - yMin);

    // compute screen coordinates
    const screenX = Math.floor(normX * screenWidth);
    const screenY = Math.floor(normY * screenHeight);

    // Compute grid cell index
    const cellX = Math.floor(screenX / gridSize);
    const cellY = Math.floor(screenY / gridSize);
    const cellKey = `${cellX},${cellY}`;

    // If the cell is empty, add the point
    if (!occupiedCells.has(cellKey)) {
      occupiedCells.add(cellKey);
      culledPoints.push(point);
    }
  });

  return culledPoints;
}
