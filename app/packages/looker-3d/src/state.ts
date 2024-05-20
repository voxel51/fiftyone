import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { atom } from "recoil";
import { SHADE_BY_HEIGHT } from "./constants";
import { FoSceneNode } from "./hooks";
import { Actions, ShadeBy } from "./types";

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
