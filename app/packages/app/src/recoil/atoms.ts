import { atom, atomFamily } from "recoil";

import { Sample, Dimensions } from "@fiftyone/looker/src/state";

import { State } from "./types";

export const connected = atom<boolean>({
  key: "connected",
  default: true,
});

interface AppSample extends Sample {
  _id: string;
}

export interface SampleData {
  sample: AppSample;
  dimensions: Dimensions;
  frameRate?: number;
  frameNumber?: number;
}

interface ModalSample extends SampleData {
  index: number;
  getIndex: (index: number) => void;
}

export const sidebarWidth = atomFamily<number, boolean>({
  key: "sidebarWidth",
  default: 300,
});

export const modal = atom<ModalSample | null>({
  key: "modal",
  default: null,
});

export interface SortResults {
  count: boolean;
  asc: boolean;
}

export const sortFilterResults = atomFamily<SortResults, boolean>({
  key: "sortFilterResults",
  default: {
    count: true,
    asc: false,
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

export const teams = atom({
  key: "teams",
  default: {
    open: false,
    submitted: false,
    minimized: false,
  },
});

export const IMAGE_FILTERS = {
  brightness: {
    default: 100,
    bounds: [0, 200],
  },
};

export const imageFilters = atomFamily<
  number,
  { modal: boolean; filter: string }
>({
  key: "imageFilters",
  default: ({ filter }) => IMAGE_FILTERS[filter].default,
});

export const activePlot = atom({
  key: "activePlot",
  default: "labels",
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

export const stateDescription = atom<State.Description>({
  key: "stateDescription",
  default: null,
});

export const selectedSamples = atom<Set<string>>({
  key: "selectedSamples",
  default: new Set(),
});

export const hiddenLabels = atom<State.SelectedLabelMap>({
  key: "hiddenLabels",
  default: {},
});

export const stageInfo = atom({
  key: "stageInfo",
  default: undefined,
});

export const sidebarVisible = atomFamily<boolean, boolean>({
  key: "sidebarVisible",
  default: true,
});

export const viewCounter = atom({
  key: "viewCounter",
  default: 0,
});

export const colorByLabel = atomFamily<boolean, boolean>({
  key: "colorByLabel",
  default: false,
});

export const DEFAULT_ALPHA = 0.7;

export const alpha = atomFamily<number, boolean>({
  key: "alpha",
  default: DEFAULT_ALPHA,
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
