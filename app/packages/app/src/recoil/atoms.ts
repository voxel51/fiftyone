import { atom, atomFamily, SerializableParam } from "recoil";

export const modal = atom<{
  visible: boolean;
  sampleId: string;
}>({
  key: "modal",
  default: {
    visible: false,
    sampleId: null,
  },
});

export interface SortResults {
  count: boolean;
  asc: boolean;
}

export const sortFilterResults = atomFamily<SortResults, boolean>({
  key: "sortFilterResults",
  default: {
    count: false,
    asc: true,
  },
});

export const cropToContent = atomFamily<boolean, boolean>({
  key: "cropToContent",
  default: true,
});

export const fullscreen = atom<boolean>({
  key: "fullscreen",
  default: false,
});

export const connected = atom({
  key: "connected",
  default: false,
});

export const closeTeams = atom({
  key: "closeTeams",
  default: null,
});

export const teamsSubmitted = atom({
  key: "teamsSubmitted",
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

export const appTeamsIsOpen = atom({
  key: "appTeamsIsOpen",
  default: false,
});

export const savedLookerOptions = atom({
  key: "savedLookerOptions",
  default: {},
});

export const modalSample = atom({
  key: "modalSample",
  default: null,
});
