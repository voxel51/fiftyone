import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { atom, atomFamily } from "recoil";
import { ACTION_GRID, SHADE_BY_HEIGHT } from "./constants";
import { Actions, ShadeBy } from "./types";

export const worldBoundsAtom = atom<THREE.Box3 | null>({
  key: "worldBounds",
  default: null,
});

export const shadeByAtom = atom<ShadeBy>({
  key: "shadeBy",
  default: SHADE_BY_HEIGHT,
  effects: [getBrowserStorageEffectForKey("shadeBy")],
});

export const customColorMapAtom = atom<{ [slice: string]: string } | null>({
  key: "customColorMap",
  default: null,
  effects: [
    getBrowserStorageEffectForKey("customColorMap", {
      useJsonSerialization: true,
    }),
  ],
});

export const actionRenderListAtomFamily = atomFamily<
  [string, any[] | null][],
  "pcd" | "fo3d"
>({
  key: "actionRenderList",
  default: [],
});

export const currentActionAtom = atom<Actions>({
  key: "openAction",
  default: null,
});

export const currentPointSizeAtom = atom<string>({
  key: "pointSize",
  default: "2",
  effects: [getBrowserStorageEffectForKey("pointSize")],
});

export const pointSizeRangeAtom = atom<Range>({
  key: "pointSizeRange",
  default: [0.1, 2],
});

export const isPointSizeAttenuatedAtom = atom<boolean>({
  key: "isPointSizeAttenuated",
  default: false,
  effects: [
    getBrowserStorageEffectForKey("isPointSizeAttenuated", {
      valueClass: "boolean",
    }),
  ],
});

export const isGridOnAtom = atom<boolean>({
  key: "isGridOn",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("isGridOn", { valueClass: "boolean" }),
  ],
});
