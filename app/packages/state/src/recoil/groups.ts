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
import { graphQLSelector } from "recoil-relay";
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

export const pinned3DSampleSlice = atom<string>({
  key: "pinned3DSampleSlice",
  default: null,
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

export const groupSlice = atomFamily<string, boolean>({
  key: "groupSlice",
  default: null,
});

export const groupMediaTypes = selector<{ name: string; mediaType: string }[]>({
  key: "groupMediaTypes",
  get: ({ get }) => {
    return get(groupSlice(false)) ? get(dataset).groupMediaTypes : [];
  },
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

export const activePcdSlices = atom<string[] | null>({
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

export const currentSlice = selectorFamily<string | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      if (modal && get(pinned3DSampleSlice)) {
        return get(pinned3DSampleSlice);
      }

      return get(groupSlice(modal));
    },
});

export const currentSlices = selectorFamily<string[] | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      if (modal && get(pinned3DSampleSlice)) {
        return get(activePcdSlices);
      }

      return [get(groupSlice(modal))].filter((s) => s);
    },
});

export const activeSliceDescriptorLabel = selector<string>({
  key: "activeSliceDescriptorLabel",
  get: ({ get }) => {
    const currentSliceValue = get(currentSlice(true));
    const activePcdSlicesValue = get(activePcdSlices);
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

export const pcdSamples = graphQLSelector<
  VariablesOf<foq.paginateSamplesQuery>,
  ModalSample[]
>({
  key: "pcdSampleQuery",
  environment: RelayEnvironmentKey,
  query: foq.paginateSamples,
  variables: ({ get }) => {
    const groupIdValue = get(groupId);

    return {
      dataset: get(datasetName),
      view: get(view),
      filter: {
        group: {
          id: groupIdValue,
          slices: get(allPcdSlices),
        },
      },
    };
  },
  mapResponse: (data: ResponseFrom<foq.paginateSamplesQuery>) => {
    return data.samples.edges.map((edge) => {
      if (edge.node.__typename !== "PointCloudSample") {
        throw new Error("unexpected type");
      }

      return mapSampleResponse(edge.node as ModalSample);
    });
  },
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
    if (get(pinned3DSampleSlice)) {
      get(activePcdSlicesToSampleMap)[get(pinned3DSampleSlice)]?.sample;
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
