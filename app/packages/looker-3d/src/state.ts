import type { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import {
  getBrowserStorageEffectForKey,
  groupId,
  modalSampleId,
} from "@fiftyone/state";
import { atom, atomFamily, selector } from "recoil";
import { SHADE_BY_HEIGHT } from "./constants";
import type { FoSceneNode } from "./hooks";
import type { Actions, AssetLoadingLog, ShadeBy } from "./types";

const fo3dAssetsParseStatusLog = atomFamily<AssetLoadingLog[], string>({
  key: "fo3d-assetsParseStatusLogs",
  default: [],
});

export const fo3dAssetsParseStatusThisSample = selector<AssetLoadingLog[]>({
  key: "fo3d-assetsParseStatusLogs",
  get: ({ get }) => {
    const thisSampleId = get(modalSampleId);
    const thisGroupId = get(groupId) ?? "";

    return get(fo3dAssetsParseStatusLog(`${thisGroupId}/${thisSampleId}`));
  },
  set: ({ get, set }, newValue) => {
    const thisSampleId = get(modalSampleId);
    const thisGroupId = get(groupId) ?? "";

    set(fo3dAssetsParseStatusLog(`${thisGroupId}/${thisSampleId}`), newValue);
  },
});

export const cameraPositionAtom = atom<[number, number, number] | null>({
  key: "fo3d-cameraPosition",
  default: null,
});

export const shadeByAtom = atom<ShadeBy>({
  key: "fo3d-shadeBy",
  default: SHADE_BY_HEIGHT,
  effects: [getBrowserStorageEffectForKey("shadeBy")],
});

export const customColorMapAtom = atom<{ [slice: string]: string } | null>({
  key: "fo3d-customColorMap",
  default: null,
  effects: [
    getBrowserStorageEffectForKey("customColorMap", {
      useJsonSerialization: true,
    }),
  ],
});

export const currentActionAtom = atom<Actions>({
  key: "fo3d-openAction",
  default: null,
});

export const currentPointSizeAtom = atom<string>({
  key: "fo3d-pointSize",
  default: "2",
  effects: [getBrowserStorageEffectForKey("pointSize")],
});

export const pointSizeRangeAtom = atom<Range>({
  key: "fo3d-pointSizeRange",
  default: [0.1, 2],
});

export const isPointSizeAttenuatedAtom = atom<boolean>({
  key: "fo3d-isPointSizeAttenuated",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("isPointSizeAttenuated", {
      valueClass: "boolean",
    }),
  ],
});

export const isGridOnAtom = atom<boolean>({
  key: "fo3d-isGridOn",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isGridOn", {
      valueClass: "boolean",
    }),
  ],
});

export const isLevaConfigPanelOnAtom = atom<boolean>({
  key: "fo3d-isLevaConfigPanelOn",
  default: false,
});

export const gridCellSizeAtom = atom<number>({
  key: "fo3d-gridCellSize",
  default: 1,
});

export const gridSectionSizeAtom = atom<number>({
  key: "fo3d-gridSectionSize",
  default: 10,
});

export const isGridInfinitelyLargeAtom = atom<boolean>({
  key: "fo3d-isGridInfinitelyLarge",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isGridInfinitelyLarge", {
      valueClass: "boolean",
    }),
  ],
});

export const gridSizeAtom = atom<number>({
  key: "fo3d-gridSize",
  default: 1000,
  effects: [getBrowserStorageEffectForKey("fo3d-gridSize")],
});

export const shouldGridFadeAtom = atom<boolean>({
  key: "fo3d-shouldGridFade",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-shouldGridFade", {
      valueClass: "boolean",
    }),
  ],
});

export const fo3dContainsBackground = atom<boolean>({
  key: "fo3d-containsBackground",
  default: false,
});

export const isFo3dBackgroundOnAtom = atom<boolean>({
  key: "fo3d-isBackgroundON",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("fo3d-isBackgroundON", {
      valueClass: "boolean",
    }),
  ],
});

export const isStatusBarOnAtom = atom<boolean>({
  key: "fo3d-isStatusBarOn",
  default: false,
});

export const activeNodeAtom = atom<FoSceneNode>({
  key: "fo3d-activeNode",
  default: null,
});

export const cuboidLabelLineWidthAtom = atom({
  key: "fo3d-cuboidLabelLineWidth",
  default: 3,
  effects: [
    getBrowserStorageEffectForKey("fo3d-cuboidLabelLineWidth", {
      valueClass: "number",
    }),
  ],
});

export const polylineLabelLineWidthAtom = atom({
  key: "fo3d-polylineLabelLineWidth",
  default: 3,
  effects: [
    getBrowserStorageEffectForKey("fo3d-polylineLabelLineWidth", {
      valueClass: "number",
    }),
  ],
});
