import { atom } from "jotai";
import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL } from "./constants";
import { LensViewMode } from "./models";

export const zoomLevelAtom = atom(
  Math.floor((MIN_ZOOM_LEVEL + MAX_ZOOM_LEVEL) / 2)
);

export const currentViewAtom = atom<LensViewMode>("grid");
