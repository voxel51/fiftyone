import {
  datasetFragment,
  graphQLSyncFragmentAtomFamily,
  mediaFieldsFragment,
  mediaFieldsFragment$key,
} from "@fiftyone/relay";
import { atom, atomFamily, selector, selectorFamily } from "recoil";
import { aggregationQuery } from "./aggregations";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { fieldPaths } from "./schema";
import {
  appConfigDefault,
  datasetAppConfig,
  isVideoDataset,
} from "./selectors";
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
    read: (data, prev) => {
      if (!data || data.name !== prev?.name)
        // reset to configured default on dataset change
        return data.sampleFields
          .map((field) => field.path)
          .includes(data.appConfig.gridMediaField)
          ? data.appConfig.gridMediaField
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

export const sidebarMode = atomFamily<"all" | "best" | "fast" | null, boolean>({
  key: "sidebarMode",
  default: null,
});

export const nonNestedDynamicGroupsViewMode = atom<"carousel" | "pagination">({
  key: "nonNestedDynamicGroupsViewMode",
  default: "carousel",
  effects: [getBrowserStorageEffectForKey("nonNestedDynamicGroupsViewMode")],
});

export const configuredSidebarModeDefault = selectorFamily<
  "all" | "best" | "fast",
  boolean
>({
  key: "configuredSidebarModeDefault",
  get:
    (modal) =>
    ({ get }) => {
      const setting = get(sidebarMode(modal));
      if (setting) {
        return setting;
      }

      const appDefault = get(
        appConfigDefault({ modal: false, key: "sidebarMode" })
      ) as "all" | "best" | "fast";

      const datasetDefault = get(datasetAppConfig)?.sidebarMode;

      return datasetDefault || appDefault;
    },
});

export const resolvedSidebarMode = selectorFamily<"all" | "fast", boolean>({
  key: "resolvedSidebarMode",
  get:
    (modal) =>
    ({ get }) => {
      const mode = get(configuredSidebarModeDefault(modal));

      if (mode !== "best") {
        return mode;
      }

      const root = get(
        aggregationQuery({
          paths: [""],
          root: true,
          modal: false,
          extended: false,
        })
      ).aggregations[0];

      if (root.__typename !== "RootAggregation") {
        throw new Error("unexpected type");
      }

      if (root.count >= 10000) {
        return "fast";
      }

      if (root.count >= 1000 && root.expandedFieldCount >= 15) {
        return "fast";
      }

      if (root.frameLabelFieldCount >= 1) {
        return "fast";
      }

      return "all";
    },
});

export const isLargeVideo = selector<boolean>({
  key: "isLargeVideo",
  get: ({ get }) => {
    const video = get(isVideoDataset);
    if (!video) {
      return false;
    }

    const data = get(
      aggregationQuery({
        extended: false,
        root: true,
        paths: [""],
        modal: false,
      })
    );

    return data.aggregations[0].count >= 1000;
  },
});
