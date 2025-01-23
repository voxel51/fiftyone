import { atomWithStorage } from "jotai/utils";
import { atom } from "jotai";
import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL } from "./constants";
import { LensViewMode } from "./models";

export const zoomLevelAtom = atomWithStorage(
  "fo-lens-zoom-level",
  Math.floor((MIN_ZOOM_LEVEL + MAX_ZOOM_LEVEL) / 2)
);

export const currentViewAtom = atomWithStorage<LensViewMode>(
  "fo-lens-view-mode",
  "grid"
);

export const isSampleTagsCheckedAtom = atom(false);
export const isLabelTagsCheckedAtom = atom(false);
export const checkedFieldsAtom = atom<string[]>([]);