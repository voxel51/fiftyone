import { atom } from "recoil";

export const stateDescription = atom({
  key: "stateDescription",
  default: {
    viewStages: [],
  },
});
