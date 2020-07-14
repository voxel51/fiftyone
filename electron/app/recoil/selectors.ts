import { selector } from "recoil";
import { stateDescription } from "./atoms";

export const viewStages = selector({
  key: "viewStages",
  get: ({ get }) => {
    return get(stateDescription).viewStages;
  },
});
