import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { atom } from "recoil";

export const ACTION_SHADE_BY = "colorBy";
export const ACTION_SET_POINT_SIZE = "setPointSize";
export const ACTION_VIEW_JSON = "json";
export const ACTION_VIEW_HELP = "help";

export type Actions =
  | typeof ACTION_SHADE_BY
  | typeof ACTION_SET_POINT_SIZE
  | typeof ACTION_VIEW_JSON
  | typeof ACTION_VIEW_HELP;

export const SHADE_BY_INTENSITY = "intensity";
export const SHADE_BY_HEIGHT = "height";
export const SHADE_BY_RGB = "rgb";
export const SHADE_BY_NONE = "none";

export type ShadeBy =
  | typeof SHADE_BY_INTENSITY
  | typeof SHADE_BY_HEIGHT
  | typeof SHADE_BY_RGB
  | typeof SHADE_BY_NONE;

export const ACTIONS = [
  { label: "Color By", value: ACTION_SHADE_BY },
  { label: "Set Point Size", value: ACTION_SET_POINT_SIZE },
  { label: "View Json", value: ACTION_VIEW_JSON },
];

export const SHADE_BY_CHOICES: { label: string; value: ShadeBy }[] = [
  { label: "Height", value: SHADE_BY_HEIGHT },
  { label: "Intensity", value: SHADE_BY_INTENSITY },
  { label: "RGB", value: SHADE_BY_RGB },
  { label: "None", value: SHADE_BY_NONE },
];

// recoil effect that syncs state with local storage
const getLocalStorageEffectFor =
  (key: string) =>
  ({ setSelf, onSet }) => {
    const value = localStorage.getItem(key);
    if (value != null) setSelf(value);

    onSet((newValue, _oldValue, isReset) => {
      if (isReset) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, newValue);
      }
    });
  };

export const shadeByAtom = atom<ShadeBy>({
  key: "shadeBy",
  default: SHADE_BY_HEIGHT,
  effects: [getLocalStorageEffectFor("shadeBy")],
});

export const currentActionAtom = atom<Actions>({
  key: "openAction",
  default: null,
});

export const currentPointSizeAtom = atom<string>({
  key: "pointSize",
  default: "1",
  effects: [getLocalStorageEffectFor("pointSize")],
});

export const pointSizeRangeAtom = atom<Range>({
  key: "pointSizeRange",
  default: [0.01, 0.2],
});
