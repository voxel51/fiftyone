import { atom } from "recoil";

export const ACTIONS = [{ label: "Color By", value: "colorBy" }];
export const COLOR_BY_CHOICES = [
  { label: "By Intensity", value: "intensity" },
  { label: "By Height", value: "height" },
  { label: "None", value: "none" },
];

export const colorBy = atom({
  key: "colorBy",
  default: COLOR_BY_CHOICES[0].value,
});

export const currentAction = atom({
  key: "openAction",
  default: null,
});
