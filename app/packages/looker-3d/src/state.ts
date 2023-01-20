import { Range } from "@fiftyone/core/src/components/Common/RangeSlider";
import { atom } from "recoil";

export const ACTION_COLOR_BY = "colorBy";
export const ACTION_SET_POINT_SIZE = "setPointSize";

export const ACTIONS = [
  { label: "Color By", value: ACTION_COLOR_BY },
  { label: "Set Point Size", value: ACTION_SET_POINT_SIZE },
];
export const COLOR_BY_CHOICES = [
  { label: "By Intensity", value: "intensity" },
  { label: "By Height", value: "height" },
  { label: "None", value: "none" },
];

export const colorBy = atom({
  key: "colorBy",
  default: COLOR_BY_CHOICES[0].value,
});

export const currentAction = atom<
  typeof ACTION_COLOR_BY | typeof ACTION_SET_POINT_SIZE
>({
  key: "openAction",
  default: null,
});

export const currentPointSize = atom({
  key: "pointSize",
  default: 0.01,
});

export const pointSizeRange = atom<Range>({
  key: "pointSizeRange",
  default: [0.1, 1.0],
});
