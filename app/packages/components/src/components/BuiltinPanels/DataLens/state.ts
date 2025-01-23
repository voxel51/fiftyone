import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
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

export const checkedFieldsAtom = atom<string[]>([]);
