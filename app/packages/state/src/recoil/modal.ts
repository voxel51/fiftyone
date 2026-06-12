import { PointInfo, type Sample } from "@fiftyone/looker";
import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, atomFamily, selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import type { Lookers } from "../hooks";
import { ComputeCoordinatesReturnType } from "../hooks/useTooltip";
import { ModalSelector, sessionAtom } from "../session";
import { ResponseFrom } from "../utils";
import { imaVidLookerState, shouldRenderImaVidLooker } from "./dynamicGroups";
import {
  activeModalSidebarSample,
  groupId,
  groupSlice,
  hasGroupSlices,
  modalGroupSlice,
} from "./groups";
import { RelayEnvironmentKey } from "./relay";
import {
  interaction3dSample,
  is3dPinned,
  pinned3DSampleSlice,
} from "./renderConfig3d.atoms";
import { datasetName } from "./selectors";
import { getLocalSample } from "../stores/sampleStore";
import { mapSampleResponse } from "./utils";
import { view } from "./view";

export const modalLooker = atom<Lookers | null>({
  key: "modalLooker",
  default: null,
  dangerouslyAllowMutability: true,
});

export const sidebarSampleId = selector<null | string>({
  key: "sidebarSampleId",
  get: ({ get }) => {
    if (get(shouldRenderImaVidLooker(true))) {
      const thisFrameNumber = get(imaVidLookerState("currentFrameNumber"));
      const isPlaying = get(imaVidLookerState("playing"));
      const isSeeking = get(imaVidLookerState("seeking"));

      const sample = get(activeModalSidebarSample);

      if (!isPlaying && !isSeeking && thisFrameNumber && sample) {
        // is the type incorrect? fix me
        const id = sample?.id || sample?._id || (sample?.sample?._id as string);
        if (id) {
          return id;
        }
      }

      // if we are playing or seeking, we don't want to change the sidebar sample and fire agg query
      return null;
    }

    const override = get(pinned3DSampleSlice);

    return get(is3dPinned) && override
      ? get(interaction3dSample).id
      : get(modalSampleId);
  },
});

export const currentSampleId = selector({
  key: "currentSampleId",
  get: ({ get }) => {
    const override = get(pinned3DSampleSlice);

    const id =
      get(is3dPinned) && override
        ? get(interaction3dSample).id
        : get(nullableModalSampleId);

    if (id?.endsWith("-modal")) {
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

export const modalSelector = sessionAtom({
  key: "modalSelector",
  default: null,
});

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => Boolean(get(modalSelector)),
});

export type ModalNavigation = {
  next: (offset?: number) => Promise<ModalSelector>;
  previous: (offset?: number) => Promise<ModalSelector>;
};

export const modalNavigation = (() => {
  let current: ModalNavigation | null;

  return {
    get: () => current,
    set: (value: ModalNavigation | null) => {
      current = value;
    },
  };
})();

export const modalSampleId = selector<string>({
  key: "modalSampleId",
  get: ({ get }) => {
    const current = get(modalSelector);

    if (!current) {
      throw new Error("modal sample is not defined");
    }

    return current.id;
  },
});

export const nullableModalSampleId = selector<string>({
  key: "nullableModalSampleId",
  get: ({ get }) => {
    const current = get(modalSelector);

    if (!current) {
      return null;
    }

    return current.id;
  },
});

/**
 * Bumped (by `useUpdateSamples`) whenever a sample's canonical local copy
 * (see `stores/sampleStore`) changes, so selectors overlaying it re-evaluate.
 */
export const localSampleVersion = atomFamily<number, string>({
  key: "localSampleVersion",
  default: 0,
});

const overlayLocalSample = (
  mapped: ModalSample,
  get: (atom: ReturnType<typeof localSampleVersion>) => number
): ModalSample => {
  const id = (mapped.sample as { _id?: string } | undefined)?._id;
  if (!id) {
    return mapped;
  }
  get(localSampleVersion(id));
  const local = getLocalSample(id);
  return local ? { ...mapped, sample: local } : mapped;
};

export const modalSample = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ModalSample
>({
  environment: RelayEnvironmentKey,
  key: "modalSample",
  query: mainSample,
  mapResponse: (data: ModalSampleResponse, { get, variables }) => {
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

    return overlayLocalSample(
      mapSampleResponse(data.sample) as ModalSample,
      get
    );
  },
  variables: ({ get }) => {
    const current = get(modalSelector);

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

/**
 * Same as {@link modalSample} but always pinned to the dataset's main
 * `groupSlice` for both the active slice and the requested slices. Used by
 * `groupByFieldValue` so the dynamic group value is always read from the
 * main slice's sample regardless of which slice the modal is currently
 * displaying. Has its own Relay cache key so it can resolve independently.
 */
export const groupSampleAtMainSlice = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ModalSample
>({
  environment: RelayEnvironmentKey,
  key: "groupSampleAtMainSlice",
  query: mainSample,
  mapResponse: (data: ModalSampleResponse, { get, variables }) => {
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

    return overlayLocalSample(
      mapSampleResponse(data.sample) as ModalSample,
      get
    );
  },
  variables: ({ get }) => {
    const current = get(modalSelector);

    if (current === null) return null;

    const slice = get(groupSlice);

    if (get(hasGroupSlices) && !slice) {
      return null;
    }

    return {
      dataset: get(datasetName),
      view: get(view),
      filter: {
        id: current.id,
        group: slice ? { slice, slices: [slice], id: get(groupId) } : null,
      },
    };
  },
});

export const tooltipCoordinates = atom<ComputeCoordinatesReturnType | null>({
  key: "tooltipCoordinates",
  default: null,
});

export const tooltipDetail = atom<PointInfo | null>({
  key: "tooltipDetail",
  default: null,
});

export const isTooltipLocked = atom<boolean>({
  key: "isTooltipLocked",
  default: false,
});

export class SampleNotFound extends Error {}

export class GroupSampleNotFound extends SampleNotFound {}
