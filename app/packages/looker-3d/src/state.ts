import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { atom } from "recoil";

export const ACTION_COLOR_BY = "colorBy";
export const ACTION_SET_POINT_SIZE = "setPointSize";
export const ACTION_VIEW_JSON = "json";
export const ACTION_VIEW_HELP = "help";

export type Actions =
  | typeof ACTION_COLOR_BY
  | typeof ACTION_SET_POINT_SIZE
  | typeof ACTION_VIEW_JSON
  | typeof ACTION_VIEW_HELP;

export const COLOR_BY_INTENSITY = "intensity";
export const COLOR_BY_HEIGHT = "height";
export const COLOR_BY_NONE = "none";

export type ColorBy =
  | typeof COLOR_BY_INTENSITY
  | typeof COLOR_BY_HEIGHT
  | typeof COLOR_BY_NONE;

export const ACTIONS = [
  { label: "Color By", value: ACTION_COLOR_BY },
  { label: "Set Point Size", value: ACTION_SET_POINT_SIZE },
  { label: "View Json", value: ACTION_VIEW_JSON },
];

export const COLOR_BY_CHOICES: { label: string; value: ColorBy }[] = [
  { label: "By Intensity", value: COLOR_BY_INTENSITY },
  { label: "By Height", value: COLOR_BY_HEIGHT },
  { label: "None", value: COLOR_BY_NONE },
];

/**
 * Atoms
 */

export const colorByAtom = atom<ColorBy>({
  key: "colorBy",
  default: COLOR_BY_CHOICES[0].value,
});

export const currentActionAtom = atom<Actions>({
  key: "openAction",
  default: null,
});

export const currentPointSizeAtom = atom<number>({
  key: "pointSize",
  default: 0.01,
});

export const pointSizeRangeAtom = atom<Range>({
  key: "pointSizeRange",
  default: [0.1, 1.0],
});
