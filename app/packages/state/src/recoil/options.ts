import {
  datasetFragment,
  graphQLSyncFragmentAtomFamily,
  mediaFieldsFragment,
  mediaFieldsFragment$key,
} from "@fiftyone/relay";
import { DefaultValue, atomFamily, selector, selectorFamily } from "recoil";
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

export const dynamicGroupsViewModeStore = atomFamily<
  "carousel" | "pagination" | "video" | null,
  boolean
>({
  key: "dynamicGroupsViewModeStore",
  default: null,
  effects: (modal) => [
    getBrowserStorageEffectForKey(`dynamicGroupsViewMode-${modal}`),
  ],
});

export const dynamicGroupsViewMode = selectorFamily({
  key: "dynamicGroupsViewMode",
  get:
    (modal: boolean) =>
    ({ get }) => {
      const value = get(dynamicGroupsViewModeStore(modal));

      if (!value) {
        return modal
          ? get(dynamicGroupsViewModeStore(false)) ?? "pagination"
          : "pagination";
      }

      return value;
    },
  set:
    (modal: boolean) =>
    ({ reset, set }, newValue) => {
      const instance = dynamicGroupsViewModeStore(modal);

      newValue instanceof DefaultValue
        ? reset(instance)
        : set(instance, newValue);
    },
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
