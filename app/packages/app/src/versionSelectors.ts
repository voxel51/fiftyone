import { dataset } from "@fiftyone/state";
import { selector } from "recoil";

export const datasetHeadName = selector({
  key: "datasetHeadName",
  get: ({ get }) => {
    return get(dataset)?.headName;
  },
});

export const datasetSnapshotName = selector({
  key: "datasetSnapshotName",
  get: ({ get }) => {
    return get(dataset)?.snapshotName;
  },
});
