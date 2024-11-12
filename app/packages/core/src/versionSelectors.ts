import * as atoms from "@fiftyone/state";
import { selector } from "recoil";

export const datasetHeadName = selector<string>({
  key: "datasetHeadName",
  get: ({ get }) => {
    return get(atoms.dataset)?.headName;
  },
});

export const datasetSnapshotName = selector<string>({
  key: "datasetSnapshotName",
  get: ({ get }) => {
    return get(atoms.dataset)?.snapshotName;
  },
});
