import { Sample } from "@fiftyone/looker/src/state";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import { Field } from "@fiftyone/utilities";
import {
  AtomEffect,
  atom,
  atomFamily,
  selector,
  useRecoilCallback,
} from "recoil";
import { groupMediaTypesSet } from "./groups";
import { ColorSchemeSetting, State } from "./types";

export const refresher = atom<number>({
  key: "refresher",
  default: 0,
});

export const useRefresh = () => {
  return useRecoilCallback(
    ({ set }) =>
      () => {
        set(refresher, (cur) => cur + 1);
      },
    []
  );
};

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

export const activePlot = atom<string>({
  key: "activePlot",
  default: "Labels",
});

export const loading = atom<boolean>({
  key: "loading",
  default: false,
});

// labels: whether label tag or sample tag
export const tagging = atomFamily<boolean, { modal: boolean; labels: boolean }>(
  {
    key: "tagging",
    default: false,
  }
);

/**
 * The state of the current dataset. Contains informations about the dataset, and the samples contained in it.
 *
 * See :py:class:\`fiftyone.core.dataset.Dataset\` for python documentation.
 */
export const dataset = atom<State.Dataset>({
  key: "dataset",
  default: null,
});

export const selectedViewName = atom<string>({
  key: "selectedViewName",
  default: null,
});

// only used in extended view, for tagging purpose
export const selectedLabels = atom<State.SelectedLabelMap>({
  key: "selectedLabels",
  default: {},
});

export const selectedSamples = atom<Set<string>>({
  key: "selectedSamples",
  default: new Set(),
});

export const selectedSampleObjects = atom<Map<string, Sample>>({
  key: "selectedSampleObjects",
  default: new Map(),
});

// only used in extended view, for tagging purpose
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

export const alpha = atom<number>({
  key: "alpha",
  default: DEFAULT_ALPHA,
});

export const colorSeed = atom<number>({
  key: "colorSeed",
  default: 0,
});

export const appTeamsIsOpen = atom({
  key: "appTeamsIsOpen",
  default: false,
});

export const savedLookerOptions = atom({
  key: "savedLookerOptions",
  default: {},
});

export const patching = atom<boolean>({
  key: "patching",
  default: false,
});

export const savingFilters = atom<boolean>({
  key: "savingFilters",
  default: false,
});

export const similaritySorting = atom<boolean>({
  key: "similaritySorting",
  default: false,
});

export const extendedSelection = atom<{ selection: string[]; scope?: string }>({
  key: "extendedSelection",
  default: { selection: null },
});
export const extendedSelectionOverrideStage = atom<any>({
  key: "extendedSelectionOverrideStage",
  default: null,
});

export const similarityParameters = atom<State.SortBySimilarityParameters>({
  key: "similarityParameters",
  default: null,
});

export const modalTopBarVisible = atom<boolean>({
  key: "modalTopBarVisible",
  default: true,
});

export const hoveredSample = atom<Sample>({
  key: "hoveredSample",
  default: null,
});

export const lastLoadedDatasetNameState = atom<string>({
  key: "lastLoadedDatasetNameState",
  default: "",
});

export const lookerPanels = atom({
  key: "lookerPanels",
  default: {
    json: { isOpen: false },
    help: { isOpen: false },
  },
});

// recoil effect that syncs state with local storage
export const getBrowserStorageEffectForKey =
  <T>(
    key: string,
    props: {
      map?: (value: unknown) => unknown;
      sessionStorage?: boolean;
      valueClass?: "string" | "stringArray" | "number" | "boolean";
      prependDatasetNameInKey?: boolean;
      useJsonSerialization?: boolean;
    } = {
      sessionStorage: false,
      valueClass: "string",
      prependDatasetNameInKey: false,
      useJsonSerialization: false,
    }
  ): AtomEffect<T> =>
  ({ setSelf, onSet, getPromise }) => {
    (async () => {
      const {
        valueClass,
        sessionStorage,
        useJsonSerialization,
        prependDatasetNameInKey,
      } = props;

      const storage = sessionStorage
        ? window.sessionStorage
        : window.localStorage;

      if (prependDatasetNameInKey) {
        const datasetName = (await getPromise(dataset))?.name;
        key = `${datasetName}_${key}`;
      }

      const value = storage.getItem(key);
      let procesedValue;

      if (useJsonSerialization) {
        procesedValue = JSON.parse(value);
      } else if (valueClass === "number") {
        procesedValue = Number(value);
      } else if (valueClass === "boolean") {
        procesedValue = value === "true";
      } else if (valueClass === "stringArray") {
        if (value?.length > 0) {
          procesedValue = value?.split(",");
        } else {
          procesedValue = [];
        }
      } else {
        procesedValue = value;
      }

      if (value != null) setSelf(procesedValue);

      onSet((newValue, _oldValue, isReset) => {
        if (props.map) {
          newValue = props.map(newValue) as T;
        }
        if (isReset || newValue === undefined) {
          storage.removeItem(key);
        } else {
          storage.setItem(
            key,
            useJsonSerialization
              ? JSON.stringify(newValue)
              : (newValue as string)
          );
        }
      });
    })();
  };

export const groupMediaIsCarouselVisibleSetting = atom<boolean>({
  key: "groupMediaIsCarouselVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIsCarouselVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

export const groupMedia3dVisibleSetting = atom<boolean>({
  key: "groupMediaIs3dVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIs3DVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

export const onlyPcd = selector<boolean>({
  key: "onlyPcd",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    const hasPcd = set.has("point_cloud");
    return set.size === 1 && hasPcd;
  },
});

export const groupMediaIs3dVisible = selector<boolean>({
  key: "groupMedia3dVisible",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    const hasPcd = set.has("point_cloud");
    return get(groupMedia3dVisibleSetting) && hasPcd;
  },
});

export const groupMediaIsMainVisibleSetting = atom<boolean>({
  key: "groupMediaIsMainVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIsMainVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

export const groupMediaIsMainVisible = selector<boolean>({
  key: "groupMediaIsMainVisible",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    const hasPcd = set.has("point_cloud");
    return get(groupMediaIsMainVisibleSetting) && (!hasPcd || set.size > 1);
  },
});

export const theme = atom<"dark" | "light">({
  key: "theme",
  default: "dark",
  effects: [getBrowserStorageEffectForKey("mui-mode")],
});

export const canEditSavedViews = atom({
  key: "canEditSavedViews",
  default: true,
});

export const canEditCustomColors = atom({
  key: "canEditCustomColors",
  default: true,
});

export const compactLayout = atom({
  key: "compactLayout",
  default: false,
});

export const readOnly = atom({
  key: "readOnly",
  default: false,
});

export const sessionSpaces = atom<SpaceNodeJSON>({
  key: "sessionSpaces",
  default: {
    id: "root",
    children: [
      {
        id: "default-samples-node",
        children: [],
        type: "Samples",
        pinned: true,
      },
    ],
    type: "panel-container",
    activeChild: "default-samples-node",
  },
});

// the active field for customize color modal
export const activeColorField = atom<
  { field: Field; expandedPath: string } | string | null
>({
  key: "activeColorField",
  default: null,
});

export const sessionColorScheme = atom<ColorSchemeSetting>({
  key: "sessionColorScheme",
  default: {
    colorPool: [],
    fields: [],
  },
});

export const isUsingSessionColorScheme = atom<boolean>({
  key: "isUsingSessionColorScheme",
  default: false,
});

// sidebar filter vs. visibility mode
export const isSidebarFilterMode = atom<boolean>({
  key: "isSidebarFilterMode",
  default: true,
});
