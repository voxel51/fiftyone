import { atomFamily, selector } from "recoil";
import { dataset } from "./atoms";

const defaultMediaField = selector<string>({
  key: "defaultMediaField",
  get: ({ get }) => get(dataset).appConfig.gridMediaField,
});

export const selectedMediaField = atomFamily<string, boolean>({
  key: "selectedMediaField",
  default: defaultMediaField,
});
