import type { Sample } from "@fiftyone/looker";
import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { Nullable } from "vitest";
import { ResponseFrom } from "../utils";
import { pinned3DSample } from "./atoms";
import { filters } from "./filters";
import { groupId, groupSlice, hasGroupSlices } from "./groups";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { mapSampleResponse } from "./utils";
import { view } from "./view";

export const sidebarSampleId = selector({
  key: "sidebarSampleId",
  get: ({ get }) => {
    const override = get(pinned3DSample);

    return override ? override : get(modalSampleId);
  },
});

export type ModalSampleData = Exclude<
  ResponseFrom<mainSampleQuery>["sample"],
  {
    readonly __typename: "%other";
  }
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
  mapResponse: (data: ModalSampleResponse, { get }) => {
    const current = get(currentModalSample);
    if (!data.sample) {
      throw new Error(`sample with index ${current.index} not found`);
    }

    return mapSampleResponse(data.sample) as ModalSample;
  },
  variables: ({ get }) => {
    const current = get(currentModalSample);
    if (current === null) return null;

    return {
      dataset: get(datasetName),
      view: get(view),
      filters: get(filters),
      filter: {
        id: current.id,
        group: get(hasGroupSlices)
          ? { slices: [get(groupSlice(true))], id: get(groupId) }
          : null,
      },
    };
  },
});
