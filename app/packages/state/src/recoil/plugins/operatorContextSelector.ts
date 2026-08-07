import { selector } from "recoil";
import {
  extendedSelection as extendedSelectionAtom,
  labelSelectionStyle as labelSelectionStyleAtom,
  modal as modalAtom,
  sampleSelectionStyle as sampleSelectionStyleAtom,
  selectedLabels as selectedLabelsAtom,
  selectedSamples as selectedSamplesAtom,
  sessionSpaces as sessionSpacesAtom,
} from "../atoms";
import { filters as filtersAtom } from "../filters";
import { groupSlice as groupSliceSelector } from "../groups";
import { queryPerformance as queryPerformanceSelector } from "../queryPerformance";
import { activeFields as activeFieldsSelectorFamily } from "../schema";
import {
  datasetName as datasetNameSelector,
  extendedStages as extendedStagesSelector,
} from "../selectors";
import { view as viewAtom, viewName as viewNameAtom } from "../view";
import { currentSampleId as currentSampleIdSelector } from "../modal";

const operatorContextSelector = selector({
  key: "operatorContextSelector",
  get: ({ get }) => {
    const modal = !!get(modalAtom);
    const datasetName = get(datasetNameSelector);
    const view = get(viewAtom);
    const extended = get(extendedStagesSelector);
    const filters = get(filtersAtom);
    const selectedSamples = get(selectedSamplesAtom);
    const sampleSelectionStyle = get(sampleSelectionStyleAtom);
    const labelSelectionStyle = get(labelSelectionStyleAtom);
    const selectedLabels = get(selectedLabelsAtom);
    const viewName = get(viewNameAtom);
    const extendedSelection = get(extendedSelectionAtom);
    const groupSlice = get(groupSliceSelector);
    const queryPerformance = get(queryPerformanceSelector);
    const spaces = get(sessionSpacesAtom);
    const workspaceName = spaces?._name;
    const activeFields = get(activeFieldsSelectorFamily({ modal }));
    const currentSample = get(currentSampleIdSelector);

    return {
      datasetName,
      view,
      extended,
      filters,
      selectedSamples,
      sampleSelectionStyle,
      labelSelectionStyle,
      selectedLabels,
      viewName,
      extendedSelection,
      groupSlice,
      queryPerformance,
      spaces,
      workspaceName,
      activeFields,
      currentSample,
    };
  },
});

export default operatorContextSelector;
