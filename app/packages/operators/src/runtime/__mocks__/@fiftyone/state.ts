import { atom, selector } from "recoil";

export const datasetName = atom({
  key: "mockDatasetName",
  default: "mockDataset",
});

export const view = atom({
  key: "mockView",
  default: "mockView",
});

export const extendedStages = atom({
  key: "mockExtendedStages",
  default: [],
});

export const filters = atom({
  key: "mockFilters",
  default: [],
});

export const selectedSamples = atom({
  key: "mockSelectedSamples",
  default: [],
});

export const selectedLabels = atom({
  key: "mockSelectedLabels",
  default: [],
});

export const viewName = atom({
  key: "mockViewName",
  default: "mockViewName",
});

export const extendedSelection = atom({
  key: "mockExtendedSelection",
  default: [],
});

export const groupSlice = atom({
  key: "mockGroupSlice",
  default: null,
});

export const lightningThreshold = selector({
  key: "mockLightningThreshold",
  get: () => 100, // Mock threshold value
});

export const getBrowserStorageEffectForKey = (key, options) => ({
  init: () =>
    options.useJsonSerialization
      ? JSON.parse(localStorage.getItem(key) || "[]")
      : [],
  setSelf: () => {},
  onSet: () => {},
});
