import { selector } from "recoil";
import { stateDescription } from "./atoms";

export const viewStages = selector({
  key: "viewStages",
  get: ({ get }) => {
    return get(stateDescription).viewStages;
  },
});

export const numViewStages = selector({
  key: "numStages",
  get: ({ get }) => {
    return get(viewStages).length;
  },
});

export const numSamples = selector({
  key: "numSamples",
  get: ({ get }) => {
    return get(stateDescription).count;
  },
});
