import { atom, atomFamily } from "recoil";

import { SelectedObjectMap } from "../utils/selection";

export const colorSeed = atomFamily<number, boolean>({
  key: "colorSeed",
  default: 0,
});

export const modal = atom({
  key: "modal",
  default: {
    visible: false,
    sample: null,
    metadata: null,
  },
});

export const connected = atom({
  key: "connected",
  default: false,
});

export const closeFeedback = atom({
  key: "closeFeedback",
  default: null,
});

export const feedbackSubmitted = atom({
  key: "feedbackSubmitted",
  default: {
    submitted: false,
    minimized: false,
  },
});

export const activePlot = atom({
  key: "activePlot",
  default: "labels",
});

export const datasetStatsRaw = atom({
  key: "datasetStatsRaw",
  default: {
    view: null,
    stats: {
      main: [],
      none: [],
    },
  },
});

export const extendedDatasetStatsRaw = atom({
  key: "extendedDatasetStatsRaw",
  default: {
    view: null,
    stats: { main: [], none: [] },
    filters: null,
  },
});

export const loading = atom({
  key: "loading",
  default: false,
});

export const stateDescription = atom({
  key: "stateDescription",
  default: {},
});

export const selectedSamples = atom<Set<string>>({
  key: "selectedSamples",
  default: new Set(),
});

export const selectedObjects = atom<SelectedObjectMap>({
  key: "selectedObjects",
  default: {},
});

export const hiddenObjects = atom<SelectedObjectMap>({
  key: "hiddenObjects",
  default: {},
});

export const stageInfo = atom({
  key: "stageInfo",
  default: undefined,
});

export const sidebarVisible = atom({
  key: "sidebarVisible",
  default: true,
});

export const currentSamples = atom({
  key: "currentSamples",
  default: [],
});

export const sampleVideoLabels = atomFamily({
  key: "sampleVideoLabels",
  default: null,
});

export const sampleFrameData = atomFamily({
  key: "sampleFrameData",
  default: null,
});

export const sampleFrameRate = atomFamily({
  key: "sampleFrameRate",
  default: null,
});

export const sampleVideoDataRequested = atomFamily({
  key: "sampleVideoDataRequested",
  default: null,
});

export const viewCounter = atom({
  key: "viewCounter",
  default: 0,
});

export const colorByLabel = atomFamily<boolean, boolean>({
  key: "colorByLabel",
  default: false,
});

export const appFeedbackIsOpen = atom({
  key: "appFeedbackIsOpen",
  default: false,
});

export const savedPlayerOverlayOptions = atom({
  key: "savedPlayerOverlayOptions",
  default: {},
});
