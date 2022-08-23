import { atomFamily, selectorFamily } from "recoil";
import { dataset } from "./atoms";

const defaultMediaField = selectorFamily<string, boolean>({
  key: "defaultMediaField",
  get:
    (modal) =>
    ({ get }) => {
      return (
        get(dataset)?.appConfig[modal ? "modalMediaField" : "gridMediaField"] ||
        "filepath"
      );
    },
});

export const selectedMediaField = atomFamily<string, boolean>({
  key: "selectedMediaField",
  default: defaultMediaField,
});
