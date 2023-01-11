import { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResultInfo } from "./useBrainResultInfo";

export function usePlotSelection() {
  const brainResultInfo = useBrainResultInfo();
  const patchesField = brainResultInfo?.config?.patchesField;
  const [filters, setFilters] = useRecoilState(fos.filters);
  const [overrideStage, setOverrideStage] = useRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const hasExtendedSelection =
    extendedSelection && extendedSelection.length > 0;
  const [plotSelection, setPlotSelection] = usePanelStatePartial(
    "plotSelection",
    []
  );
  const selectedPatchIds = useRecoilValue(fos.selectedPatchIds(patchesField));
  const selectedPatchSampleIds = useRecoilValue(fos.selectedPatchSamples);
  function handleSelected(selectedResults) {
    setSelectedSamples(new Set());
    setExtendedSelection(selectedResults);
    if (selectedResults === null) {
      clearSelection();
    }
  }

  function clearSelection() {
    setExtendedSelection(null);
    setPlotSelection(null);
    setOverrideStage(null);
    setSelectedSamples(new Set());
    setFilters({});
  }
  let selectionStyle = null;
  const selected = Array.from(selectedSamples);
  const selectedPatchIdsArr = Array.from(selectedPatchIds);
  const selectedPatchSampleIdsArr = Array.from(selectedPatchSampleIds);
  let resolvedSelection = null;

  if (
    !patchesField &&
    selectedPatchSampleIdsArr &&
    selectedPatchSampleIdsArr.length
  ) {
    resolvedSelection = selectedPatchSampleIdsArr;
    selectionStyle = "selected";
  } else if (selectedPatchIdsArr && selectedPatchIdsArr.length) {
    resolvedSelection = selectedPatchIdsArr;
    selectionStyle = "selected";
  } else if (selected && selected.length) {
    resolvedSelection = selected;
    selectionStyle = "selected";
  } else if (plotSelection && plotSelection.length) {
    resolvedSelection = plotSelection;
    selectionStyle = "plot";
  } else if (extendedSelection && extendedSelection.length) {
    resolvedSelection = extendedSelection;
    selectionStyle = "extended";
  }

  const hasSelection = resolvedSelection !== null;
  return {
    setPlotSelection,
    handleSelected,
    clearSelection,
    resolvedSelection,
    hasSelection,
    selectionStyle,
  };
}

// function useResolvedSelection(plotSelection, extendedSelection) {
//   const datasetName = useRecoilState(fos.datasetName)
//   const extended = useRecoilValue(fos.extendedStagesUnsorted);
//   const [filters, setFilters] = useRecoilState(fos.filters);
//   const [overrideStage, setOverrideStage] = useRecoilState(
//     fos.extendedSelectionOverrideStage
//   );
//   const [extendedSelection, setExtendedSelection] = useRecoilState(
//     fos.extendedSelection
//   );
//   const [selectedSamples, setSelectedSamples] = useRecoilState(
//     fos.selectedSamples
//   );
//   const hasExtendedSelection =
//     extendedSelection && extendedSelection.length > 0;
//   const [plotSelection, setPlotSelection] = usePanelStatePartial(
//     "plotSelection",
//     []
//   );
//   const [backendResolvedSelection, setBackendResolvedSelection] = usePanelStatePartial(
//     "backendResolvedSelection",
//     []
//   )
//   const [resolvedSelection, setResolvedSelection] = usePanelStatePartial(
//     "resolvedSelection",
//     []
//   )
//   const [isLoading, setIsLoading] = usePanelStatePartial('isLoadingResolvedSelection', false)

//   useEffect(() => {
//     if (loadedPlot && !isLoading) {
//       setIsLoading(true)
//       const resolvedExtended = extendedSelection ? extended : null;
//       fetchUpdatedSelection({
//         datasetName,
//         brainKey,
//         view,
//         filters,
//         extended: resolvedExtended,
//         extendedSelection,
//       }).then((res) => {
//         setBackendResolvedSelection(res.selected);
//         setIsLoading(false);
//       });
//     }
//   }, [
//     datasetName,
//     brainKey,
//     view,
//     filters,
//     extendedSelection,
//   ])

//   useEffect(() => {
//   }, [
//     backendResolvedSelection,
//     selectedSamples,
//     extendedSelection,
//   ]

// }

// function resolveSelection(gridType, embeddingsType, plotSelection, extendedSelection) {
//   if (selectedSamples) {
//     if (gridType === embeddingsType) {
//       return selectedSamples
//     } else if (gridType === PATCHES) {
//       // embeddingsType = SAMPLES
//       // selectedSamples is patch ids
//       // need to convert patch ids to sample ids

//       // or for every sample id - see if it corresponds to a selectedSampleObject
//     } else {
//       // gridType = SAMPLES
//       // embeddingsType = PATCHES
//     }
//   }
// }
