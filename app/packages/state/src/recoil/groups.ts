import {
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
import { dataset, pinned3DSample, refresher } from "./atoms";
import { ModalSample, modalSample } from "./modal";
import { RelayEnvironmentKey } from "./relay";
import { fieldPaths } from "./schema";
import { datasetName } from "./selectors";
import { State } from "./types";
import { mapSampleResponse } from "./utils";
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

export const hasGroupSlices = selector<boolean>({
  key: "hasGroupSlices",
  get: ({ get }) => get(isGroup) && Boolean(get(groupSlices).length),
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
        default: get(modalSample),
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

export const groupId = atom<string>({
  key: "groupId",
  default: null,
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
    return {
      dataset: get(datasetName),
      view: get(view),
      index: get(refresher),
      filter: {
        group: {
          id: get(groupId),
        },
      },
    };
  },
});

export const dynamicGroupPaginationQuery = graphQLSelector<
  VariablesOf<paginateGroupQuery>,
  ResponseFrom<paginateGroupQuery>
>({
  key: "dynamicGroupQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) => response,
  query: paginateGroup,
  variables: ({ get }) => {
    return {
      dataset: get(datasetName),
      filter: {},
      view: get(dynamicGroupViewQuery),
    };
  },
});

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
        filter: {
          group: {
            id: groupIdValue,
            slices: [pcdSlice],
          },
        },
      };
    },
  mapResponse: (data: ResponseFrom<pcdSampleQuery>) =>
    mapSampleResponse(data.sample as ModalSample),
});

export const groupByFieldValue = atom<string | null>({
  key: "groupByFieldValue",
  default: null,
});

export const groupPaginationFragment = selector<paginateGroup_query$key>({
  key: "groupPaginationFragment",
  get: ({ get }) => get(groupQuery),
});

export const dynamicGroupPaginationFragment = selector<paginateGroup_query$key>(
  {
    key: "dynamicGroupPaginationFragment",
    get: ({ get }) => {
      return get(dynamicGroupPaginationQuery);
    },
    cachePolicy_UNSTABLE: {
      eviction: "lru",
      maxSize: 20,
    },
  }
);

export const nestedGroupIndex = atom<number>({
  key: "nestedGroupIndex",
  default: null,
});

export const activeModalSample = selector<
  NonNullable<ResponseFrom<pcdSampleQuery>["sample"]>["sample"]
>({
  key: "activeModalSample",
  get: ({ get }) => {
    if (get(pinned3DSample)) {
      return get(pcdSampleQueryFamily(get(currentSlice(true))))?.sample;
    }

    return get(modalSample).sample;
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
