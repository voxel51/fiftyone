import {
  datasetFragment,
  graphQLSyncFragmentAtomFamily,
  mediaFieldsFragment,
  mediaFieldsFragment$key,
} from "@fiftyone/relay";
import { atom, atomFamily, selector, selectorFamily } from "recoil";
import { configData } from "./config";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { datasetSampleCount } from "./dataset";
import { count } from "./pathData";
import { fieldPaths, labelPaths } from "./schema";
import { datasetAppConfig, isVideoDataset } from "./selectors";
import { disabledPaths, sidebarEntries } from "./sidebar";
import { State } from "./types";
import { view } from "./view";

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

export const nonNestedDynamicGroupsViewMode = atom<
  "carousel" | "pagination" | "video"
>({
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

      const appDefault = get(configData).config.sidebarMode;
      const datasetDefault = get(datasetAppConfig)?.sidebarMode;

      if (
        appDefault === "%future added value" ||
        datasetDefault === "%future added value"
      ) {
        throw new Error("unexpected");
      }

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

      // see https://docs.voxel51.com/user_guide/app.html#sidebar-mode
      const sampleCount = get(view).length
        ? get(count({ path: "", modal: false, extended: false }))
        : get(datasetSampleCount);

      if (sampleCount >= 10000) {
        return "fast";
      }

      const disabled = get(disabledPaths);
      const paths = get(sidebarEntries({ modal: false, loading: true })).filter(
        (data) => data.kind === "PATH" && !disabled.has(data.path)
      );

      if (sampleCount >= 1000 && paths.length >= 15) {
        return "fast";
      }

      if (
        get(isVideoDataset) &&
        get(labelPaths({ space: State.SPACE.FRAME })).length > 0
      ) {
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

    return get(datasetSampleCount) >= 1000;
  },
});
