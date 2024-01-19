import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { atom } from "recoil";
import { SHADE_BY_HEIGHT } from "./constants";
import { Actions, ShadeBy } from "./types";

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
