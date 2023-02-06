import { atom, selector } from "recoil";

import { State } from "./types";

export const view = atom<State.Stage[]>({
  key: "view",
  default: [],
});

export const viewCls = atom<string>({
  key: "viewCls",
  default: null,
});

export const viewName = atom<string>({
  key: "viewName",
  default: null,
});

export const isRootView = selector<boolean>({
  key: "isRootView",
  get: ({ get }) =>
    [undefined, null, "fiftyone.core.view.DatasetView"].includes(get(viewCls)),
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const CLIPS_VIEW = "fiftyone.core.clips.ClipsView";
const FRAMES_VIEW = "fiftyone.core.video.FramesView";
const EVALUATION_PATCHES_VIEW = "fiftyone.core.patches.EvaluationPatchesView";
const PATCHES_VIEW = "fiftyone.core.patches.PatchesView";
const PATCH_VIEWS = [PATCHES_VIEW, EVALUATION_PATCHES_VIEW];

enum ELEMENT_NAMES {
  CLIP = "clip",
  FRAME = "frame",
  PATCH = "patch",
  SAMPLE = "sample",
}

enum ELEMENT_NAMES_PLURAL {
  CLIP = "clips",
  FRAME = "frames",
  PATCH = "patches",
  SAMPLE = "samples",
}

export const rootElementName = selector<string>({
  key: "rootElementName",
  get: ({ get }) => {
    const cls = get(viewCls);
    if (PATCH_VIEWS.includes(cls)) {
      return ELEMENT_NAMES.PATCH;
    }

    if (cls === CLIPS_VIEW) return ELEMENT_NAMES.CLIP;

    if (cls === FRAMES_VIEW) return ELEMENT_NAMES.FRAME;

    return ELEMENT_NAMES.SAMPLE;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const rootElementNamePlural = selector<string>({
  key: "rootElementNamePlural",
  get: ({ get }) => {
    const elementName = get(rootElementName);

    switch (elementName) {
      case ELEMENT_NAMES.CLIP:
        return ELEMENT_NAMES_PLURAL.CLIP;
      case ELEMENT_NAMES.FRAME:
        return ELEMENT_NAMES_PLURAL.FRAME;
      case ELEMENT_NAMES.PATCH:
        return ELEMENT_NAMES_PLURAL.PATCH;
      default:
        return ELEMENT_NAMES_PLURAL.SAMPLE;
    }
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const elementNames = selector<{ plural: string; singular: string }>({
  key: "elementNames",
  get: ({ get }) => {
    return {
      plural: get(rootElementNamePlural),
      singular: get(rootElementName),
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isClipsView = selector<boolean>({
  key: "isClipsView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.CLIP;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isPatchesView = selector<boolean>({
  key: "isPatchesView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.PATCH;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isFramesView = selector<boolean>({
  key: "isFramesView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.FRAME;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const currentViewSlug = selector<string>({
  key: "currentViewSlug",
  get: () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || null;
  },
});

export const DEFAULT_SELECTED: DatasetViewOption = {
  id: "1",
  label: "Unsaved view",
  color: "#9e9e9e",
  description: "Unsaved view",
  slug: "unsaved-view",
  viewStages: [],
};

export type DatasetViewOption = Pick<
  State.SavedView,
  "id" | "description" | "color" | "viewStages"
> & { label: string; slug: string };

export const selectedSavedViewState = atom<DatasetViewOption | null>({
  key: "selectedSavedViewState",
  default: DEFAULT_SELECTED,
});
