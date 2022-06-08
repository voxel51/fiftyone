import { atom, atomFamily, useRecoilTransaction_UNSTABLE } from "recoil";

import { Sample, Dimensions, RGB } from "@fiftyone/looker/src/state";

import { State } from "./types";
import { paginateGroupQuery } from "@fiftyone/relay";
import { PreloadedQuery } from "react-relay";

interface AppSample extends Sample {
  _id: string;
  support?: [number, number];
}

export interface SampleData {
  sample: AppSample;
  dimensions: Dimensions;
  frameRate?: number;
  frameNumber?: number;
  url?: string;
}

export interface ModalNavigation {
  index: number;
  getIndex: (index: number) => void;
}

interface ModalSample extends SampleData {
  navigation: ModalNavigation;
}

export const refresher = atom<boolean>({
  key: "refresher",
  default: false,
});

export const useRefresh = () => {
  return useRecoilTransaction_UNSTABLE(
    ({ get, set }) =>
      () => {
        set(refresher, !get(refresher));
      },
    []
  );
};

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

export const showOverlays = atom<boolean>({
  key: "showOverlays",
  default: true,
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
  default: "Labels",
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

export const dataset = atom<State.Dataset>({
  key: "dataset",
  default: null,
});

export const selectedLabels = atom<State.SelectedLabelMap>({
  key: "selectedLabels",
  default: {},
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

export const viewCounter = atom({
  key: "viewCounter",
  default: 0,
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

export const appConfig = atom<State.Config>({
  key: "appConfig",
  default: null,
});

export const colorscale = atom<RGB[]>({
  key: "colorscale",
  default: null,
});

export const selectedMediaField = atom<State.MediaFieldSelection>({
  key: "selectedGridMediaField",
  default: { grid: "filepath", modal: null },
});
