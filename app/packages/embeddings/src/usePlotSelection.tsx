import { useEffect } from "react";
import { useRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";

export function usePlotSelection() {
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
  let resolvedSelection = null;
  if (selected && selected.length) {
    resolvedSelection = selected;
    selectionStyle = "selected";
  } else if (extendedSelection && extendedSelection.length) {
    resolvedSelection = extendedSelection;
    selectionStyle = "extended";
  }

  useEffect(() => {
    console.log("setting plot selection", resolvedSelection);
    setPlotSelection(resolvedSelection);
  }, [selectedSamples, extendedSelection]);
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
