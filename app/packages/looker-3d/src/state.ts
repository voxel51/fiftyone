import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { atom, atomFamily } from "recoil";
import { SHADE_BY_HEIGHT } from "./constants";
import { FoSceneNode } from "./hooks";
import { Actions, ShadeBy, VisibilityMap } from "./types";

export const worldBoundsAtom = atom<THREE.Box3 | null>({
  key: "fo3d-worldBounds",
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

export const actionRenderListAtomFamily = atomFamily<
  [string, any[] | null][],
  "pcd" | "fo3d"
>({
  key: "fo3d-actionRenderListAtomFamily",
  default: [],
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

export const panelPositionAtom = atom<{ x?: number; y?: number } | null>({
  key: "fo3d-panelPosition",
  default: null,
});

export const activeNodeAtom = atom<FoSceneNode>({
  key: "fo3d-activeNode",
  default: null,
});

export const currentVisibilityMapAtom = atom<VisibilityMap>({
  key: "fo3d-currentVisibilityMap",
  default: {},
});
