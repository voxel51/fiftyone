import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useBrainResultInfo } from "./useBrainResultInfo";

export function usePlotSelection() {
  const brainResultInfo = useBrainResultInfo();
  const patchesField = brainResultInfo?.config?.patchesField;
  const setFilters = useSetRecoilState(fos.filters);
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const [plotSelection, setPlotSelection] = usePanelStatePartial(
    "plotSelection",
    [],
    true
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
