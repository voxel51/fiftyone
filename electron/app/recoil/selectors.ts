import { selector } from "recoil";
import * as atoms from "./atoms";

export const viewStages = selector({
  key: "viewStages",
  get: ({ get }) => {
    return get(atoms.stateDescription).viewStages;
  },
});

export const numViewStages = selector({
  key: "numStages",
  get: ({ get }) => {
    return get(viewStages).length;
  },
});

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => {
    return get(atoms.stateDescription).dataset.name;
  },
});

export const numSamples = selector({
  key: "numSamples",
  get: ({ get }) => {
    return get(atoms.stateDescription).count;
  },
});

export const labelColorMapping = selector({
  key: "labelColorMapping",
  get: ({ get }) => {
    const colors = get(atoms.colors);
    const { labels, tags } = get(atoms.stateDescription).derivables;

    const colorMapping = {};
    let i = 0;
    for (const label of labels) {
      colorMapping[label._id.field] = colors[i++];
    }
    for (const tag of tags) {
      colorMapping[tag] = colors[i++];
    }
    return colorMapping;
  },
});

export const tagNames = selector({
  key: "tagNames",
  get: ({ get }) => {
    return get(atoms.stateDescription).derivables.tags || [];
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    return get(atoms.stateDescription).derivables.dataset_stats.tags || {};
  },
});
