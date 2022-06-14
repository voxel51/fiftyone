import { atomFamily, selector } from "recoil";
import { dataset } from "./atoms";

import { State } from "./types";

const datasetAppConfig = selector<State.DatasetAppConfig>({
  key: "datasetAppConfig",
  get: ({ get }) => get(dataset).appConfig,
});

const gridMediaField = selector({
  key: "gridMediaField",
  get: ({ get }) => get(datasetAppConfig).gridMediaField,
});

export const selectedMediaField = atomFamily<string, boolean>({
  key: "selectedMediaField",
  default: (modal) => (modal ? "filepath" : gridMediaField),
});
