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
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset ? stateDescription.dataset.name : null;
  },
});

export const datasetStats = selector({
  key: "datasetStats",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.derivables
      ? stateDescription.derivables.dataset_stats
      : {};
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
    const { labels = [], tags = [] } =
      get(atoms.stateDescription).derivables || {};

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

export const fieldSchema = selector({
  key: "fieldSchema",
  get: ({ get }) => {
    const derivables = get(atoms.stateDescription).derivables || {};
    return derivables.field_schema || {};
  },
});

export const labelNames = selector({
  key: "labelNames",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    const stats = get(datasetStats);
    if (!stateDescription.derivables || !stateDescription.derivables.labels) {
      return [];
    }
    return stateDescription.derivables.labels
      .map((label) => label._id.field)
      .filter((name) => stats.custom_fields.hasOwnProperty(name));
  },
});

export const labelTypes = selector({
  key: "labelTypes",
  get: ({ get }) => {
    const { labels } = get(atoms.stateDescription).derivables || {};
    const names = get(labelNames);
    const types = {};
    for (const label of labels) {
      if (names.includes(label._id.field)) {
        types[label._id.field] = label._id.cls;
      }
    }
    return types;
  },
});

export const labelSampleCounts = selector({
  key: "labelSampleCounts",
  get: ({ get }) => {
    return get(datasetStats).custom_fields || {};
  },
});
