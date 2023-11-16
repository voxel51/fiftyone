import { AbstractLooker, ImaVidLooker, type Sample } from "@fiftyone/looker";
import { BaseState } from "@fiftyone/looker/src/state";
import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { Nullable } from "vitest";
import { ResponseFrom } from "../utils";
import {
  groupId,
  groupSlice,
  hasGroupSlices,
  imaVidLookerState,
  modalGroupSlice,
  pinned3DSample,
  pinned3DSampleSlice,
  pinned3d,
  shouldRenderImaVidLooker,
} from "./groups";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { mapSampleResponse } from "./utils";
import { view } from "./view";

export const modalLooker = atom<AbstractLooker<BaseState> | null>({
  key: "modalLooker",
  default: null,
  dangerouslyAllowMutability: true,
});

export const sidebarSampleId = selector({
  key: "sidebarSampleId",
  get: ({ get }) => {
    if (get(shouldRenderImaVidLooker)) {
      const thisFrameNumber = get(imaVidLookerState("currentFrameNumber"));
      const isPlaying = get(imaVidLookerState("playing"));
      const isSeeking = get(imaVidLookerState("seeking"));

      const thisLooker = get(modalLooker) as ImaVidLooker;
      console.log(
        "isplaying",
        isPlaying,
        "thisFramenumber",
        thisFrameNumber,
        "isSeeking",
        isSeeking
      );

      if (!isPlaying && !isSeeking && thisFrameNumber && thisLooker) {
        const sample = thisLooker.thisFrameSample;
        const id = sample?.id || sample?.sample?._id;
        if (id) {
          return id;
        }
      } else {
        // suspend
        return new Promise(() => {});
      }
    }

    const override = get(pinned3DSampleSlice);

    return get(pinned3d) && override
      ? get(pinned3DSample).id
      : get(modalSampleId);
  },
});

export const currentSampleId = selector({
  key: "currentSampleId",
  get: ({ get }) => {
    const override = get(pinned3DSampleSlice);

    const id =
      get(pinned3d) && override
        ? get(pinned3DSample).id
        : get(nullableModalSampleId);

    if (id && id.endsWith("-modal")) {
      return id.replace("-modal", "");
    }
    return id;
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

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => Boolean(get(currentModalSample)),
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

export const nullableModalSampleId = selector<string>({
  key: "nullableModalSampleId",
  get: ({ get }) => {
    const current = get(currentModalSample);

    if (!current) {
      return null;
    }

    return current.id;
  },
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

    const slice = get(groupSlice);
    const sliceSelect = get(modalGroupSlice);

    if (get(hasGroupSlices) && (!slice || !sliceSelect)) {
      return null;
    }

    return {
      dataset: get(datasetName),
      view: get(view),
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
