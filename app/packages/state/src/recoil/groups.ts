import {
  mainSample,
  mainSampleQuery$data,
  mainSampleQuery as mainSampleQueryGraphQL,
  paginateGroup,
  paginateGroupQuery,
  paginateGroup_query$key,
  pcdSample,
  pcdSampleQuery,
} from "@fiftyone/relay";
import {
  DYNAMIC_GROUP_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  GROUP,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { VariablesOf } from "react-relay";
import { atom, atomFamily, selector, selectorFamily, waitForAll } from "recoil";
import { graphQLSelector, graphQLSelectorFamily } from "recoil-relay";
import type { ResponseFrom } from "../utils";
import { aggregateSelectorFamily } from "./aggregate";
import {
  AppSample,
  SampleData,
  dataset,
  modal as modalAtom,
  pinned3DSample,
  refresher,
} from "./atoms";
import { RelayEnvironmentKey } from "./relay";
import { fieldPaths } from "./schema";
import { datasetName } from "./selectors";
import { State } from "./types";
import { dynamicGroupViewQuery, view } from "./view";

export type SliceName = string | undefined | null;

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

export const defaultPcdSlice = selector<string | null>({
  key: "defaultPcdSlice",
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

export const pointCloudSliceExists = selector<boolean>({
  key: "sliceMediaTypeMap",
  get: ({ get }) =>
    get(dataset).groupMediaTypes.some((g) => g.mediaType === "point_cloud"),
});

export const allPcdSlices = selector<string[]>({
  key: "allPcdSlices",
  get: ({ get }) =>
    get(dataset)
      .groupMediaTypes.filter((g) => g.mediaType === "point_cloud")
      .map((g) => g.name),
});

export const activePcdSlices = atom<string[] | null>({
  key: "activePcdSlices",
  default: null,
});

export const activePcdSliceToSampleMap = selector({
  key: "activePcdSliceToSampleMap",
  get: ({ get }) => {
    const activePcdSlicesValue = get(activePcdSlices);
    if (!activePcdSlicesValue || activePcdSlicesValue.length === 0)
      return {
        default: get(modalAtom),
      };

    const samples = get(
      waitForAll(
        activePcdSlicesValue?.map((sliceName) =>
          pcdSampleQueryFamily(sliceName)
        )
      )
    );
    return Object.fromEntries(
      activePcdSlicesValue.map((sliceName, i) => [sliceName, samples[i]])
    );
  },
});

export const currentSlice = selectorFamily<string | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      if (modal && get(pinned3DSample)) {
        const current = get(currentSlices(true));

        return current?.length === 1 ? current[0] : get(defaultPcdSlice);
      }

      return get(groupSlice(modal)) || get(defaultGroupSlice);
    },
});

export const currentSlices = selectorFamily<string[] | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      if (modal && get(pinned3DSample)) {
        return get(activePcdSlices);
      }

      const defaultCurrentSlice =
        get(groupSlice(modal)) || get(defaultGroupSlice);

      return defaultCurrentSlice ? [defaultCurrentSlice] : null;
    },
});

export const activeSliceDescriptorLabel = selector<string>({
  key: "activeSliceDescriptorLabel",
  get: ({ get }) => {
    const currentSliceValue = get(currentSlice(true));
    const activePcdSlicesValue = get(activePcdSlices) ?? [get(defaultPcdSlice)];
    const isPcdSliceActive = activePcdSlicesValue?.includes(currentSliceValue);

    if (!isPcdSliceActive) {
      return currentSliceValue;
    }

    const numActivePcdSlices = activePcdSlicesValue?.length;

    switch (numActivePcdSlices) {
      case 1:
        return activePcdSlicesValue[0];
      case 2:
        return `${activePcdSlicesValue.join(" and ")}`;
      default:
        return `${numActivePcdSlices} point-clouds`;
    }
  },
});

export const groupField = selector<string>({
  key: "groupField",
  get: ({ get }) => get(dataset).groupField,
});

export const groupId = selector<string>({
  key: "groupId",
  get: ({ get }) => {
    return get(modalAtom)?.sample[get(groupField)]?._id;
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
      index: get(refresher),
      filter: {
        group: {
          id: sample[group]._id as string,
        },
      },
    };
  },
});

export const dynamicGroupPaginationQuery = graphQLSelectorFamily<
  VariablesOf<paginateGroupQuery>,
  string,
  ResponseFrom<paginateGroupQuery>
>({
  key: "dynamicGroupQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) => response,
  query: paginateGroup,
  variables:
    (fieldOrExpression) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        filter: {},
        view: get(dynamicGroupViewQuery(fieldOrExpression)),
      };
    },
});

const mapSampleResponse = (response: mainSampleQuery$data) => {
  const actualRawSample = response?.sample?.sample;

  // This value may be a string that needs to be deserialized
  // Only occurs after calling useUpdateSample for pcd sample
  // - https://github.com/voxel51/fiftyone/pull/2622
  // - https://github.com/facebook/relay/issues/91
  if (actualRawSample && typeof actualRawSample === "string") {
    return {
      ...response.sample,
      sample: JSON.parse(actualRawSample),
    };
  }

  return response.sample;
};

export const pcdSampleQueryFamily = graphQLSelectorFamily<
  VariablesOf<pcdSampleQuery>,
  string,
  ResponseFrom<pcdSampleQuery>["sample"]
>({
  key: "pcdSampleQuery",
  environment: RelayEnvironmentKey,
  query: pcdSample,
  variables:
    (pcdSlice) =>
    ({ get }) => {
      const groupIdValue = get(groupId);

      return {
        dataset: get(datasetName),
        view: get(view),
        index: get(refresher),
        filter: {
          group: {
            id: groupIdValue,
            slices: [pcdSlice],
          },
        },
      };
    },
  mapResponse: mapSampleResponse,
});

export const groupPaginationFragment = selector<paginateGroup_query$key>({
  key: "groupPaginationFragment",
  get: ({ get }) => get(groupQuery),
});

export const dynamicGroupSamplesStoreMap = atomFamily<
  Map<number, SampleData>,
  string
>({
  key: "dynamicGroupSamplesStoreMap",
  // todo: use map with LRU cache
  default: new Map<number, SampleData>(),
});

export const dynamicGroupPaginationFragment = selectorFamily<
  paginateGroup_query$key,
  { fieldOrExpression: string }
>({
  key: "dynamicGroupPaginationFragment",
  get:
    ({ fieldOrExpression }) =>
    ({ get }) => {
      return get(dynamicGroupPaginationQuery(fieldOrExpression));
    },
  cachePolicy_UNSTABLE: {
    eviction: "lru",
    maxSize: 20,
  },
});

export const activeModalSample = selectorFamily<
  AppSample | ResponseFrom<pcdSampleQuery>["sample"],
  SliceName
>({
  key: "activeModalSample",
  get:
    (sliceName) =>
    ({ get }) => {
      if (!sliceName || !get(isGroup)) {
        return get(modalAtom).sample;
      }

      if (get(pinned3DSample) || get(activePcdSlices)?.includes(sliceName)) {
        return get(pcdSampleQueryFamily(sliceName)).sample;
      }

      return get(groupSample(sliceName)).sample;
    },
});

const groupSampleQuery = graphQLSelectorFamily<
  VariablesOf<mainSampleQueryGraphQL>,
  SliceName,
  ResponseFrom<mainSampleQueryGraphQL>["sample"]
>({
  environment: RelayEnvironmentKey,
  key: "mainSampleQuery",
  mapResponse: mapSampleResponse,
  query: mainSample,
  variables:
    (slice) =>
    ({ get }) => {
      return {
        view: get(view),
        dataset: get(dataset).name,
        index: get(refresher),
        filter: {
          group: {
            slices: [slice ?? get(groupSlice(true))],
            id: get(modalAtom)?.sample[get(groupField)]._id as string,
          },
        },
      };
    },
});

export const groupSample = selectorFamily<SampleData, SliceName>({
  key: "mainGroupSample",
  get:
    (sliceName) =>
    ({ get }) => {
      if (sliceName) {
        return get(groupSampleQuery(sliceName));
      }

      const field = get(groupField);
      const group = get(isGroup);

      const sample = get(modalAtom);

      if (!field || !group) return sample;

      if (sample.sample[field].name === get(groupSlice(true))) {
        return sample;
      }

      const fallbackSample = get(groupSampleQuery(sliceName));

      if (fallbackSample?.sample) {
        return fallbackSample;
      }

      return sample;
    },
});

export const groupStatistics = atomFamily<"group" | "slice", boolean>({
  key: "groupStatistics",
  default: "slice",
});

export const dynamicGroupFields = selector<string[]>({
  key: "dynamicGroupFields",
  get: ({ get }) => {
    const groups = get(
      fieldPaths({
        ftype: EMBEDDED_DOCUMENT_FIELD,
        embeddedDocType: GROUP,
        space: State.SPACE.SAMPLE,
      })
    );
    const lists = get(
      fieldPaths({ ftype: LIST_FIELD, space: State.SPACE.SAMPLE })
    );
    const primitives = get(
      fieldPaths({ ftype: DYNAMIC_GROUP_FIELDS, space: State.SPACE.SAMPLE })
    ).filter((path) => path !== "filepath" && path !== "id");

    const filtered = primitives.filter(
      (path) =>
        lists.every((list) => !path.startsWith(list)) &&
        groups.every(
          (group) => path !== `${group}.id` && path !== `${group}.name`
        )
    );
    const counts = get(aggregateSelectorFamily({ paths: filtered })).aggregate;

    return filtered.filter((_, index) => {
      const data = counts[index];
      if (data.__typename !== "CountResponse") {
        throw new Error("expected a CountResponse");
      }

      return data.count > 0;
    });
  },
});
