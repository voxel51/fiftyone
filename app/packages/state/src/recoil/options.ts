import {
  datasetFragment,
  graphQLSyncFragmentAtomFamily,
  mediaFieldsFragment,
  mediaFieldsFragment$key,
} from "@fiftyone/relay";
import { atomFamily, selector, selectorFamily } from "recoil";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { datasetSampleCount } from "./dataset";
import { fieldPaths } from "./schema";
import { isVideoDataset } from "./selectors";
import { State } from "./types";

export const selectedMediaFieldAtomFamily = graphQLSyncFragmentAtomFamily<
  mediaFieldsFragment$key,
  string,
  boolean
>(
  {
    fragments: [datasetFragment, mediaFieldsFragment],
    keys: ["dataset"],
    default: "filepath",
    read: (data, prev, modal) => {
      const key = modal ? "modalMediaField" : "gridMediaField";
      if (!data || data.name !== prev?.name)
        // reset to configured default on dataset change
        return data.sampleFields
          .map((field) => field.path)
          .includes(data.appConfig[key])
          ? data.appConfig[key]
          : "filepath";

      // return the stored value
      return (cur) => cur;
    },
  },
  {
    key: "selectedMediaFieldAtomFamily",
  }
);

export const selectedMediaField = selectorFamily<string, boolean>({
  key: "selectedMediaField",
  get:
    (modal) =>
    ({ get }) => {
      const value = get(selectedMediaFieldAtomFamily(modal));
      return get(fieldPaths({ space: State.SPACE.SAMPLE })).includes(value)
        ? value
        : "filepath";
    },
  set:
    (modal) =>
    ({ set }, value) =>
      set(selectedMediaFieldAtomFamily(modal), value),
});

export const dynamicGroupsViewMode = atomFamily<
  "carousel" | "pagination" | "video",
  boolean
>({
  key: "dynamicGroupsViewMode",
  default: "pagination",
  effects: (modal) => [
    getBrowserStorageEffectForKey(`dynamicGroupsViewMode-${modal}`),
  ],
});

export const isLargeVideo = selector<boolean>({
  key: "isLargeVideo",
  get: ({ get }) => {
    const video = get(isVideoDataset);
    if (!video) {
      return false;
    }

    return get(datasetSampleCount) >= 1000;
  },
});
