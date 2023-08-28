import * as foq from "@fiftyone/relay";
import {
  DYNAMIC_GROUP_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  GROUP,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { get as getPath } from "lodash";
import { VariablesOf } from "react-relay";
import { atom, atomFamily, selector, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import type { ResponseFrom } from "../utils";
import { aggregateSelectorFamily } from "./aggregate";
import { dataset } from "./atoms";
import { ModalSample, modalSample } from "./modal";
import { RelayEnvironmentKey } from "./relay";
import { fieldPaths } from "./schema";
import { datasetName } from "./selectors";
import { State } from "./types";
import { mapSampleResponse } from "./utils";
import { view } from "./view";

export const pinned3DSampleSlice = atom<string | null>({
  key: "pinned3DSampleSlice",
  default: null,
});

export const pinned3d = atom<boolean>({
  key: "pinned3d",
  default: false,
});

export const pinned3DSample = selector({
  key: "pinned3DSample",
  get: ({ get }) => get(allPcdSlicesToSampleMap)[get(pinned3DSampleSlice)],
});

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
    return get(groupSlice(false)) ? get(dataset).defaultGroupSlice : null;
  },
});

export const groupSlice = atomFamily<string | null, boolean>({
  key: "groupSlice",
  default: null,
});

export const groupMediaTypes = selector<{ name: string; mediaType: string }[]>({
  key: "groupMediaTypes",
  get: ({ get }) => {
    return get(groupSlice(false)) ? get(dataset).groupMediaTypes : [];
  },
});

export const groupMediaTypesMap = selector({
  key: "groupMediaTypesMap",
  get: ({ get }) =>
    Object.fromEntries(
      get(groupMediaTypes).map(({ name, mediaType }) => [name, mediaType])
    ),
});

export const groupSlices = selector<string[]>({
  key: "groupSlices",
  get: ({ get }) => {
    return get(groupSlice(false))
      ? get(groupMediaTypes)
          .map(({ name }) => name)
          .sort()
      : [];
  },
});

export const groupMediaTypesSet = selector<Set<string>>({
  key: "groupMediaTypesSet",
  get: ({ get }) =>
    new Set(get(groupMediaTypes).map(({ mediaType }) => mediaType)),
});

export const hasGroupSlices = selector<boolean>({
  key: "hasGroupSlices",
  get: ({ get }) =>
    get(isGroup) && get(groupSlice(false)) && Boolean(get(groupSlices).length),
});

export const activePcdSlices = atom<string[]>({
  key: "activePcdSlices",
  default: [],
});

export const activePcdSlicesToSampleMap = selector({
  key: "activePcdSlicesToSampleMap",
  get: ({ get }) => {
    const active = get(activePcdSlices);

    if (!active?.length) {
      return {
        default: get(modalSample),
      };
    }

    return Object.fromEntries(
      Object.entries(get(allPcdSlicesToSampleMap)).filter(([slice]) =>
        active.includes(slice)
      )
    );
  },
});

export const allPcdSlicesToSampleMap = selector({
  key: "allPcdSlicesToSampleMap",
  get: ({ get }) => {
    return Object.fromEntries<ModalSample>(
      get(pcdSamples).map<[string, ModalSample]>((sample) => [
        getPath(sample.sample, `${get(groupField)}.name`) as unknown as string,
        sample as ModalSample,
      ])
    );
  },
});

export const allPcdSlices = selector<string[]>({
  key: "allPcdSlices",
  get: ({ get }) => {
    return get(groupMediaTypes)
      .filter(({ mediaType }) =>
        ["point-cloud", "point_cloud"].includes(mediaType)
      )
      .map(({ name }) => name);
  },
});

export const allNonPcdSlices = selector<string[]>({
  key: "allNonPcdSlices",
  get: ({ get }) => {
    return get(groupMediaTypes)
      .filter(
        ({ mediaType }) => !["point-cloud", "point_cloud"].includes(mediaType)
      )
      .map(({ name }) => name);
  },
});

export const currentSlice = selectorFamily<string | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      const slice = get(groupSlice(modal));

      if (!slice || (modal && get(pinned3d))) {
        return get(pinned3DSampleSlice);
      }

      return slice;
    },
});

export const currentSlices = selectorFamily<string[] | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;
      const slice = get(groupSlice(modal));

      if (!slice || (modal && get(pinned3d))) {
        return get(activePcdSlices);
      }

      return [slice].filter((s) => s);
    },
});

export const activeSliceDescriptorLabel = selector<string>({
  key: "activeSliceDescriptorLabel",
  get: ({ get }) => {
    const currentSliceValue = get(currentSlice(true));
    const activePcdSlicesValue = get(activePcdSlices);

    if (!get(pinned3d)) {
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

export const groupSamples = graphQLSelectorFamily<
  VariablesOf<foq.paginateSamplesQuery>,
  { slices: string[]; count: number | null; paginationData?: boolean },
  ModalSample[]
>({
  key: "groupSamples",
  environment: RelayEnvironmentKey,
  query: foq.paginateSamples,
  variables:
    ({ slices, count = null, paginationData = true }) =>
    ({ get }) => {
      const groupIdValue = get(groupId);

      return {
        count,
        dataset: get(datasetName),
        view: get(view),
        filter: {
          group: {
            slice: get(groupSlice(false)),
            id: groupIdValue,
            slices,
          },
        },
        paginationData,
      };
    },
  mapResponse: (data: ResponseFrom<foq.paginateSamplesQuery>) => {
    return data.samples.edges.map((edge) => {
      return mapSampleResponse(edge.node as ModalSample);
    });
  },
});

export const nonPcdSamples = selector({
  key: "nonPcdSamples",
  get: ({ get }) =>
    get(groupSamples({ slices: get(allNonPcdSlices), count: 1 })),
});

export const pcdSamples = selector({
  key: "pcdSamples",
  get: ({ get }) =>
    get(
      groupSamples({
        slices: get(allPcdSlices),
        count: null,
        // do not omit dict data, provide the unfiltered samples to Looker3d
        paginationData: false,
      })
    ),
});

export const groupByFieldValue = atom<string | null>({
  key: "groupByFieldValue",
  default: null,
});

export const nestedGroupIndex = atom<number>({
  key: "nestedGroupIndex",
  default: null,
});

export const activeModalSample = selector({
  key: "activeModalSample",
  get: ({ get }) => {
    if (get(pinned3d)) {
      return get(activePcdSlicesToSampleMap)[get(pinned3DSampleSlice)]?.sample;
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
