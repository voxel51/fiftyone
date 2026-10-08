import { useEffect } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResult } from "./useBrainResult";
import { fetchUpdatedSelection } from "./fetch";
import { usePlotSelection } from "./usePlotSelection";
import { shouldResolveSelection } from "./utils";

export function useSelectionEffect() {
  const { setPlotSelection } = usePlotSelection();
  const datasetName = useReverbValue(fos.datasetName);
  const selectedSamples = useReverbValue(fos.selectedSamples);
  const [brainKey] = useBrainResult();
  const view = useReverbValue(fos.view);
  const [loadedPlot] = usePanelStatePartial("loadedPlot", null, true);
  const filters = useReverbValue(fos.filters);
  const extended = useReverbValue(fos.extendedStagesUnsorted);
  const { selection } = useReverbValue(fos.extendedSelection);
  const slices = useReverbValue(fos.currentSlices(false));

  // updated the selection when the extended view updates
  useEffect(() => {
    if (loadedPlot) {
      const resolvedExtended = selection ? extended : null;
      if (
        shouldResolveSelection(
          view,
          filters,
          loadedPlot?.patches_field,
          loadedPlot?.points_field,
        )
      ) {
        fetchUpdatedSelection({
          datasetName,
          brainKey,
          view,
          filters,
          extended: resolvedExtended,
          extendedSelection: selection,
          slices,
        }).then((res) => {
          let resolved = null;
          if (res.selected) {
            resolved = res.selected;
          } else if (selectedSamples && selectedSamples.size) {
            resolved = Array.from(selectedSamples.keys());
          }
          setPlotSelection(resolved);
        });
      }
    }
  }, [
    datasetName,
    brainKey,
    view,
    filters,
    selection,
    selectedSamples,
    loadedPlot?.patches_field,
  ]);
}
