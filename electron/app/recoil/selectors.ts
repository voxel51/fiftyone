import { selector } from "recoil";
import { stateDescription, labelData } from "./atoms";

export const viewStages = selector({
  key: "viewStages",
  get: ({ get }) => {
    return get(stateDescription).viewStages;
  },
});

export const numViewStages = selector({
  key: "numStages",
  get: ({ get }) => {
    return get(viewStages).length;
  },
});

export const numSamples = selector({
  key: "numSamples",
  get: ({ get }) => {
    return get(stateDescription).count;
  },
});

export const tagNames = selector({
  key: "tagNames",
  get: ({ get }) => {
    return get(labelData).tags || [];
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    return get(stateDescription).derivables.dataset_stats.tags || {};
  },
});
