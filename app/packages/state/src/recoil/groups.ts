import {
  mainSample,
  mainSampleQuery,
  paginateGroup,
  paginateGroupPinnedSampleFragment,
  paginateGroupPinnedSample_query$key,
  paginateGroupQuery,
  paginateGroup_query$key,
} from "@fiftyone/relay";
import { VariablesOf, readInlineData, graphql } from "react-relay";
import { atomFamily, selector, selectorFamily } from "recoil";
import { graphQLSelector } from "recoil-relay";
import {
  AppSample,
  dataset,
  modal,
  modal as modalAtom,
  sidebarOverride,
} from "./atoms";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { view } from "./view";

export type ResponseFrom<TQuery extends { response: unknown }> =
  TQuery["response"];

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

export const groupSlices = selector<string[]>({
  key: "groupSlices",
  get: ({ get }) => {
    return get(dataset)
      .groupMediaTypes.filter(({ mediaType }) => mediaType !== "point_cloud")
      .map(({ name }) => name)
      .sort();
  },
});

export const pinnedSlice = selector<string | null>({
  key: "pinnedSlice",
  get: ({ get }) => {
    const { groupMediaTypes } = get(dataset);
    for (const { name, mediaType } of groupMediaTypes) {
      if (mediaType === "point_cloud") {
        return name;
      }
    }

    return null;
  },
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
      pinnedSampleFilter: {
        group: {
          id: sample[group]._id,
          slice: get(pinnedSlice),
        },
      },
    };
  },
});

export const pinnedSliceSample = selector({
  key: "pinnedSliceSampleFragment",
  get: ({ get }) => {
    const data = readInlineData<paginateGroupPinnedSample_query$key>(
      paginateGroupPinnedSampleFragment,
      get(groupQuery)
    ).sample;

    if (data.__typename !== "PointCloudSample") {
      throw new Error("unsupported pinned sample type");
    }

    return data.sample;
  },
});

export const groupPaginationFragment = selector<paginateGroup_query$key>({
  key: "groupPaginationFragment",
  get: ({ get }) => get(groupQuery),
});

export const activeModalSample = selector<
  AppSample | paginateGroupPinnedSample_query$key
>({
  key: "activeModalSample",
  get: ({ get }) => {
    if (get(sidebarOverride)) {
      return get(pinnedSliceSample);
    }

    return get(modal)?.sample;
  },
});

const mainSampleQuery = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ResponseFrom<mainSampleQuery>
>({
  environment: RelayEnvironmentKey,
  key: "mainSampleQuery",
  mapResponse: (response) => response,
  query: mainSample,
  variables: ({ get }) => {
    return {
      view: get(view),
      dataset: get(dataset).name,
      filter: {
        group: {
          slice: get(groupSlice(true)),
          id: get(modal).sample[get(groupField)]._id,
        },
      },
    };
  },
});

export const mainGroupSample = selector<AppSample>({
  key: "mainGroupSample",
  get: ({ get }) => {
    const slice = get(groupSlice(true));

    const sample = get(modal).sample;

    if (sample[get(groupField)].name === slice) {
      return sample;
    }

    return get(mainSampleQuery).sample.sample as AppSample;
  },
});
