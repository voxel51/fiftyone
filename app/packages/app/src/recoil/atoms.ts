import { atom, atomFamily } from "recoil";

import { Sample, Dimensions } from "@fiftyone/looker/src/state";

import { State } from "./types";

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
