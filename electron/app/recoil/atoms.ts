import { atom } from "recoil";

export const stateDescription = atom({
  key: "stateDescription",
  default: {
    viewStages: [],
  },
});

export const viewStages = atom({
  key: "viewStages",
  default: ["exclude", "exists"],
});
