import { atom } from "recoil";

export const port = atom({
  key: "port",
  default: 5151,
});

export const stateDescription = atom({
  key: "stateDescription",
  default: {},
});

export const stageInfo = atom({
  key: "stageInfo",
  default: undefined,
});

export const labelData = atom({
  key: "labelData",
  default: {},
});

export const selectedTags = atom({
  key: "selectedTags",
  default: new Set(),
});
