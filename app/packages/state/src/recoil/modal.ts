import type { Sample } from "@fiftyone/looker";
import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { Nullable } from "vitest";
import { ResponseFrom } from "../utils";
import { filters } from "./filters";
import {
  groupId,
  groupSlice,
  hasGroupSlices,
  pinned3DSample,
  pinned3DSampleSlice,
  pinned3d,
} from "./groups";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { mapSampleResponse } from "./utils";
import { view } from "./view";

export const sidebarSampleId = selector({
  key: "sidebarSampleId",
  get: ({ get }) => {
    const override = get(pinned3DSampleSlice);

    return get(pinned3d) && override
      ? get(pinned3DSample).id
      : get(modalSampleId);
  },
});

export type ModalSampleData = Exclude<
  Exclude<
    ResponseFrom<mainSampleQuery>["sample"],
    {
      readonly __typename: "%other";
    }
  >,
  null
>;

export type ModalSample = {
  readonly sample: Sample;
} & Omit<ModalSampleData, "sample">;

type ModalSampleResponse = ResponseFrom<mainSampleQuery> & {
  sample: ModalSample;
};

type ModalSelector = {
  id: string;
  index: number;
};

export const currentModalSample = atom<ModalSelector | null>({
  key: "currentModalSample",
  default: null,
});

export type ModalNavigation = (
  index: number
) => Promise<{ id: string; groupId?: string; groupByFieldValue?: string }>;

export const currentModalNavigation = atom<Nullable<ModalNavigation>>({
  key: "currentModalNavigation",
  default: null,
});

export const modalSampleIndex = selector<number>({
  key: "modalSampleIndex",
  get: ({ get }) => {
    const current = get(currentModalSample);

    if (!current) {
      throw new Error("modal sample is not defined");
    }

    return current.index;
  },
});

export const modalSampleId = selector<string>({
  key: "modalSampleId",
  get: ({ get }) => {
    const current = get(currentModalSample);

    if (!current) {
      throw new Error("modal sample is not defined");
    }

    return current.id;
  },
});

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => get(currentModalSample) !== null,
});

export const modalSample = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ModalSample
>({
  environment: RelayEnvironmentKey,
  key: "modalSample",
  query: mainSample,
  mapResponse: (data: ModalSampleResponse, { variables }) => {
    if (!data.sample) {
      if (variables.filter.group) {
        throw new GroupSampleNotFound(
          `sample with group id ${variables.filter.id} and slice ${variables.filter.group.slices[0]} not found`
        );
      }

      throw new SampleNotFound(
        `sample with id ${variables.filter.id} not found`
      );
    }

    return mapSampleResponse(data.sample) as ModalSample;
  },
  variables: ({ get }) => {
    const current = get(currentModalSample);
    if (current === null) return null;

    const slice = get(groupSlice(false));
    const sliceSelect = get(groupSlice(true));

    if (get(hasGroupSlices) && (!slice || !sliceSelect)) {
      return null;
    }

    return {
      dataset: get(datasetName),
      view: get(view),
      filters: get(filters),
      filter: {
        id: current.id,
        group: slice
          ? { slice, slices: [sliceSelect], id: get(groupId) }
          : null,
      },
    };
  },
});

export class SampleNotFound extends Error {}

export class GroupSampleNotFound extends SampleNotFound {}
