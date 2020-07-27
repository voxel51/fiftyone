import { atom } from "recoil";

export const port = atom({
  key: "port",
  default: 5151,
});

export const stateDescription = atom({
  key: "stateDescription",
  default: {
    viewStages: [],
  },
});
export const stageInfo = atom({
  key: "stageInfo",
  default: undefined,
});
