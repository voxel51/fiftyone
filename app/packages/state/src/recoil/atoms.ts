import { Sample } from "@fiftyone/looker/src/state";
import {
  MediaType,
  datasetFragment,
  datasetFragment$key,
  frameFieldsFragment,
  frameFieldsFragment$data,
  frameFieldsFragment$key,
  graphQLSyncFragmentAtom,
  mediaTypeFragment,
  mediaTypeFragment$key,
  sampleFieldsFragment,
  sampleFieldsFragment$data,
  sampleFieldsFragment$key,
} from "@fiftyone/relay";
import { StrictField } from "@fiftyone/utilities";
import { DefaultValue, atom, atomFamily, selector } from "recoil";
import { ModalSample } from "..";
import { GRID_SPACES_DEFAULT, sessionAtom } from "../session";
import { collapseFields } from "../utils";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { groupMediaTypesSet } from "./groups";
import { State } from "./types";

export const refresher = atom<number>({
  key: "refresher",
  default: 0,
});

export const modal = (() => {
  let modal: ModalSample | null = null;
  return graphQLSyncFragmentAtom<datasetFragment$key, ModalSample | null>(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      read: (data, previous) => {
        if (data.id !== previous?.id) {
          modal = null;
        }

        return modal;
      },
      default: null,
    },
    {
      key: "modal",
      effects: [
        ({ onSet }) => {
          onSet((value) => {
            modal = value;
          });
        },
      ],
    }
  );
})();

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
  effects: [
    getBrowserStorageEffectForKey("fullscreen", { valueClass: "boolean" }),
  ],
});

export const showOverlays = atom<boolean>({
  key: "showOverlays",
  default: true,
});

export const showModalNavigationControls = atom<boolean>({
  key: "showModalNavigationControls",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("showModalNavigationControls", {
      valueClass: "boolean",
    }),
  ],
});

export const activePlot = atom<string>({
  key: "activePlot",
  default: "Labels",
});

export const loading = atom<boolean>({
  key: "loading",
  default: false,
});

export const snackbarErrors = atom<string[]>({
  key: "snackbarErrors",
  default: [],
});

export const snackbarLink = atom<{ link: string; message: string } | null>({
  key: "snackbarLink",
  default: null,
});

// labels: whether label tag or sample tag
export const tagging = atomFamily<boolean, { modal: boolean; labels: boolean }>(
  {
    key: "tagging",
    default: false,
  }
);

export const mediaType = graphQLSyncFragmentAtom<
  mediaTypeFragment$key,
  MediaType | null
>(
  {
    fragments: [datasetFragment, mediaTypeFragment],
    keys: ["dataset"],
    read: (data) => data.mediaType,
    default: null,
  },
  {
    key: "mediaType",
  }
);

export const flatSampleFields = graphQLSyncFragmentAtom<
  sampleFieldsFragment$key,
  sampleFieldsFragment$data["sampleFields"]
>(
  {
    fragments: [datasetFragment, sampleFieldsFragment],
    keys: ["dataset"],
    read: (data) => data.sampleFields,
    default: [],
  },
  {
    key: "flatSampleFields",
  }
);

export const sampleFields = selector<StrictField[]>({
  key: "sampleFields",
  get: ({ get }) => collapseFields(get(flatSampleFields) || []),
});

export const flatFrameFields = graphQLSyncFragmentAtom<
  frameFieldsFragment$key,
  frameFieldsFragment$data["frameFields"]
>(
  {
    fragments: [datasetFragment, frameFieldsFragment],
    keys: ["dataset"],
    read: (data) => data.frameFields,
    default: [],
  },
  {
    key: "flatFrameFields",
  }
);

export const frameFields = selector<StrictField[]>({
  key: "frameFields",
  get: ({ get }) => collapseFields(get(flatFrameFields) || []),
});

export const selectedViewName = atom<string>({
  key: "selectedViewName",
  default: null,
});

export const selectedLabels = sessionAtom({
  key: "selectedLabels",
  default: [],
});

export const selectedSamples = sessionAtom({
  key: "selectedSamples",
  default: new Set<string>(),
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

export const colorSeed = atom<number>({
  key: "colorSeed",
  default: 0,
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

export const extendedSelection = (() => {
  let current = { selection: null };
  return graphQLSyncFragmentAtom<
    datasetFragment$key,
    { selection: string[]; scope?: string }
  >(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      default: { selection: null },
      read: (data, previous) => {
        if (previous && data.id !== previous?.id) {
          current = { selection: null };
        }

        return current;
      },
    },
    {
      key: "extendedSelection",
    }
  );
})();

export const extendedSelectionOverrideStage = (() => {
  let current = null;
  return graphQLSyncFragmentAtom<datasetFragment$key, any>(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      default: null,
      read: (data, previous) => {
        if (previous && data.id !== previous?.id) {
          current = null;
        }

        return current;
      },
    },
    {
      key: "extendedSelectionOverrideStage",
    }
  );
})();

export const similarityParameters = (() => {
  let update = false;
  let parameters: State.SortBySimilarityParameters | null = null;

  return graphQLSyncFragmentAtom<
    datasetFragment$key,
    State.SortBySimilarityParameters | null
  >(
    {
      fragments: [datasetFragment],
      keys: ["dataset"],
      read: (data, previous) => {
        if (data.id !== previous?.id && !update) {
          parameters = null;
        }
        update = false;

        return parameters;
      },
      default: null,
      selectorEffect: (_, newValue) => {
        update = true;
        parameters = newValue instanceof DefaultValue ? null : newValue;
        return parameters;
      },
    },
    {
      key: "similarityParameters",
    }
  );
})();

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

export const only3d = selector<boolean>({
  key: "only3d",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    const has3d = set.has("point_cloud") || set.has("three_d");
    return set.size === 1 && has3d;
  },
});

export const theme = atom<"dark" | "light">({
  key: "theme",
  default: "dark",
  effects: [getBrowserStorageEffectForKey("mui-mode")],
});

export const canEditSavedViews = sessionAtom({
  key: "canEditSavedViews",
  default: { enabled: true, message: null },
});

export const canEditWorkspaces = sessionAtom({
  key: "canEditWorkspaces",
  default: { enabled: true, message: null },
});

export const canEditCustomColors = sessionAtom({
  key: "canEditCustomColors",
  default: { enabled: true, message: null },
});

export const canCreateNewField = sessionAtom({
  key: "canCreateNewField",
  default: { enabled: true, message: null },
});

export const canModifySidebarGroup = sessionAtom({
  key: "canModifySidebarGroup",
  default: { enabled: true, message: null },
});

export const canTagSamplesOrLabels = sessionAtom({
  key: "canTagSamplesOrLabels",
  default: { enabled: true, message: null },
});

export const readOnly = sessionAtom({
  key: "readOnly",
  default: false,
});

export const sessionSpaces = sessionAtom({
  key: "sessionSpaces",
  default: GRID_SPACES_DEFAULT,
});

export const colorScheme = sessionAtom({
  key: "colorScheme",
});

// sidebar filter vs. visibility mode
export const isSidebarFilterMode = atom<boolean>({
  key: "isSidebarFilterMode",
  default: true,
});

export const hideNoneValuedFields = atom<boolean>({
  key: "hideNoneValuedFields",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("hideNoneValuedFields", {
      valueClass: "boolean",
    }),
  ],
});

export const noneValuedPaths = atom<Record<string, Set<string>>>({
  key: "noneValuedPaths",
  default: {},
});

export const escapeKeyHandlerIdsAtom = atom<Set<string>>({
  key: "escapeKeyHandlerIdsAtom",
  default: new Set(),
});

export const editingFieldAtom = atom<boolean>({
  key: "editingFieldAtom",
  default: false,
});
