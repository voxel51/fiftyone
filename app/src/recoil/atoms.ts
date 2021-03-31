import { atom, atomFamily, SerializableParam } from "recoil";

export const modal = atom({
  key: "modal",
  default: {
    visible: false,
    sample_id: null,
  },
});

export const showModalJSON = atom({
  key: "showModalJSON",
  default: false,
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

export const tagging = atomFamily<boolean, { modal: boolean; labels: boolean }>(
  {
    key: "tagging",
    default: false,
  }
);

export const stateDescription = atom({
  key: "stateDescription",
  default: {},
});

export const selectedSamples = atom<Set<string>>({
  key: "selectedSamples",
  default: new Set(),
});

export const isSelectedSample = atomFamily<boolean, string>({
  key: "isSelectedSample",
  default: false,
});

export interface SelectedLabelData {
  sample_id: string;
  field: string;
  frame_number?: number;
}

export interface SelectedLabel extends SelectedLabelData {
  label_id: string;
}

export type SelectedLabelMap = {
  [label_id: string]: SelectedLabelData;
};

export const hiddenLabels = atom<SelectedLabelMap>({
  key: "hiddenLabels",
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

export const gridRows = atom({
  key: "gridRows",
  default: {
    rows: [],
    remainder: [],
  },
});

export const sample = atomFamily<SerializableParam, string>({
  key: "sample",
  default: null,
});

export const sampleDimensions = atomFamily<
  { width: number | null; height: number | null },
  string
>({
  key: "sampleDimensions",
  default: {
    width: null,
    height: null,
  },
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

export const colorPool = atom<string[]>({
  key: "colorPool",
  default: [],
});

export const colorSeed = atomFamily<number, boolean>({
  key: "colorSeed",
  default: 1,
});

export const appFeedbackIsOpen = atom({
  key: "appFeedbackIsOpen",
  default: false,
});

export const savedPlayerOverlayOptions = atom({
  key: "savedPlayerOverlayOptions",
  default: {},
});

export const matchedTagsModal = atomFamily<Set<string>, string>({
  key: "matchedTagsModal",
  default: new Set(),
});
