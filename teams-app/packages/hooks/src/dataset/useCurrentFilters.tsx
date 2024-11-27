import {
  extendedStages,
  filters,
  selectedSamples,
  view,
} from "@fiftyone/state";
import { selector, useRecoilValue } from "recoil";

export const currentDatasetFilters = selector({
  key: "teams.currentDatasetFilters",
  get: ({ get }) => {
    return {
      filters: get(filters),
      extended: get(extendedStages),
      sampleIds: [...get(selectedSamples)],
    };
  },
});

// @ts-ignore
export function useCurrentFilters() {
  const viewState = useRecoilValue(view);
  const formState = useRecoilValue(currentDatasetFilters);
  return { view: viewState, form: formState };
}
