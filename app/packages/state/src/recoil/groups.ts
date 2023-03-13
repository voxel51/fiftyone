import {
  mainSample,
  mainSampleQuery as mainSampleQueryGraphQL,
  paginateGroup,
  paginateGroupQuery,
  paginateGroup_query$key,
  pinnedSample,
  pinnedSampleQuery,
} from "@fiftyone/relay";

import { VariablesOf } from "react-relay";
import { atom, atomFamily, selector, selectorFamily } from "recoil";

import { graphQLSelector, graphQLSelectorFamily } from "recoil-relay";
import type { ResponseFrom } from "../utils";
import {
  AppSample,
  dataset,
  getBrowserStorageEffectForKey,
  modal,
  modal as modalAtom,
  sidebarOverride,
} from "./atoms";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { view } from "./view";

type SliceName = string | undefined | null;

export const isGroup = selector<boolean>({
  key: "isGroup",
  get: ({ get }) => {
    return get(dataset)?.mediaType === "group";
  },
});

export const defaultGroupSlice = selector<string>({
  key: "defaultGroupSlice",
  get: ({ get }) => {
    return get(dataset).defaultGroupSlice;
  },
});

export const groupSlice = atomFamily<string, boolean>({
  key: "groupSlice",
  default: null,
});

export const resolvedGroupSlice = selectorFamily<string, boolean>({
  key: "resolvedGroupSlice",
  get:
    (modal) =>
    ({ get }) => {
      return get(groupSlice(modal)) || get(defaultGroupSlice);
    },
});

export const groupMediaTypes = selector<{ name: string; mediaType: string }[]>({
  key: "groupMediaTypes",
  get: ({ get }) => get(dataset).groupMediaTypes,
});

export const groupSlices = selector<string[]>({
  key: "groupSlices",
  get: ({ get }) => {
    return get(groupMediaTypes)
      .map(({ name }) => name)
      .sort();
  },
});

export const defaultPinnedSlice = selector<string | null>({
  key: "defaultPinnedSlice",
  get: ({ get }) => {
    const { groupMediaTypes } = get(dataset);

    for (const { name, mediaType } of groupMediaTypes) {
      // return the first point cloud slice
      if (["point_cloud", "point-cloud"].includes(mediaType)) {
        return name;
      }
    }

    return null;
  },
});

export const pinnedSlice = atom<string | null>({
  key: "pinnedSlice",
  default: defaultPinnedSlice,
  effects: [getBrowserStorageEffectForKey("pinnedSlice")],
});

export const currentSlice = selectorFamily<string | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      if (modal && get(sidebarOverride)) {
        return get(pinnedSlice);
      }

      return get(groupSlice(modal)) || get(defaultGroupSlice);
    },
});

export const hasPinnedSlice = selector<boolean>({
  key: "hasPinnedSlice",
  get: ({ get }) => Boolean(get(pinnedSlice)),
});

export const groupField = selector<string>({
  key: "groupField",
  get: ({ get }) => get(dataset).groupField,
});

export const groupId = selector<string>({
  key: "groupId",
  get: ({ get }) => {
    return get(modalAtom).sample[get(groupField)]._id;
  },
});

export const refreshGroupQuery = atom<number>({
  key: "refreshGroupQuery",
  default: 0,
});

export const groupQuery = graphQLSelector<
  VariablesOf<paginateGroupQuery>,
  ResponseFrom<paginateGroupQuery>
>({
  key: "groupQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) => response,
  query: paginateGroup,
  variables: ({ get }) => {
    const sample = get(modalAtom).sample;

    const group = get(groupField);

    return {
      dataset: get(datasetName),
      view: get(view),
      filter: {
        group: {
          id: sample[group]._id,
        },
      },
    };
  },
});

export const pinnedSliceSample = graphQLSelector<
  VariablesOf<pinnedSampleQuery>,
  ResponseFrom<pinnedSampleQuery>["sample"]
>({
  key: "pinnedSliceSampleFragment",
  environment: RelayEnvironmentKey,
  query: pinnedSample,
  variables: ({ get }) => {
    const sample = get(modalAtom).sample;
    const group = get(groupField);
    return {
      dataset: get(datasetName),
      view: get(view),
      filter: {
        group: {
          id: sample[group]._id,
          slice: get(pinnedSlice),
        },
      },
    };
  },
  mapResponse: (response) => {
    const actualRawSample = response?.sample?.sample;

    // This value may be a string that needs to be deserialized
    // Only occurs after calling useUpdateSample for pinned sample
    // - https://github.com/voxel51/fiftyone/pull/2622
    // - https://github.com/facebook/relay/issues/91
    if (actualRawSample && typeof actualRawSample === "string") {
      return {
        ...response.sample,
        sample: JSON.parse(actualRawSample),
      };
    }
    return response.sample;
  },
});

export const groupPaginationFragment = selector<paginateGroup_query$key>({
  key: "groupPaginationFragment",
  get: ({ get }) => get(groupQuery),
});

export const activeModalSample = selectorFamily<
  AppSample | ResponseFrom<pinnedSampleQuery>["sample"],
  SliceName
>({
  key: "activeModalSample",
  get:
    (sliceName) =>
    ({ get }) => {
      if (!sliceName || !get(isGroup)) {
        return get(modalAtom).sample;
      }

      if (get(sidebarOverride) || get(pinnedSlice) === sliceName) {
        return get(pinnedSliceSample).sample;
      }

      return get(groupSample(sliceName));
    },
});

const groupSampleQuery = graphQLSelectorFamily<
  VariablesOf<mainSampleQueryGraphQL>,
  SliceName,
  ResponseFrom<mainSampleQueryGraphQL>
>({
  environment: RelayEnvironmentKey,
  key: "mainSampleQuery",
  mapResponse: (response) => response,
  query: mainSample,
  variables:
    (slice) =>
    ({ get }) => {
      return {
        view: get(view),
        dataset: get(dataset).name,
        filter: {
          group: {
            slice: slice ?? get(groupSlice(true)),
            id: get(modal).sample[get(groupField)]._id,
          },
        },
      };
    },
});

export const groupSample = selectorFamily<AppSample, SliceName>({
  key: "mainGroupSample",
  get:
    (sliceName) =>
    ({ get }) => {
      if (sliceName) {
        return get(groupSampleQuery(sliceName)).sample.sample as AppSample;
      }

      const field = get(groupField);
      const group = get(isGroup);

      const sample = get(modal).sample;

      if (!field || !group) return sample;

      if (sample[field].name === get(groupSlice(true))) {
        return sample;
      }

      return get(groupSampleQuery(sliceName)).sample.sample as AppSample;
    },
});

export const groupStatistics = atomFamily<"group" | "slice", boolean>({
  key: "groupStatistics",
  default: "slice",
});
