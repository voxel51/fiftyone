import { PointInfo, type Sample } from "@fiftyone/looker";
import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, selector, useRecoilValue } from "recoil";
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
import {
  exclusionViewStages,
  lensWireExclusions,
  taskSchemaWireExclusions,
} from "./schemaSettings.atoms";
import { datasetName } from "./selectors";
import { mapSampleResponse, withoutPaths } from "./utils";
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

/** Returns whether the sample modal is currently active. */
export function useModalActive(): boolean {
  return useRecoilValue(isModalActive);
}

export type ModalNavigationPeek = {
  id: string;
  /**
   * The paginated sample node for the peeked position ({ sample, urls, ... }),
   * as loaded by the grid. Typed loosely because the paginator's node type
   * belongs to the relay layer.
   */
  sample: unknown;
};

export type ModalNavigation = {
  next: (offset?: number) => Promise<ModalSelector>;
  previous: (offset?: number) => Promise<ModalSelector>;
  /**
   * Resolves the sample `offset` steps from the current one without
   * navigating, or null past either boundary. Negative offsets peek
   * backwards. Renderers use this to prewarm adjacent samples' media.
   */
  peek?: (offset: number) => Promise<ModalNavigationPeek | null>;
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
 * The view of the modal sample queries: the current view plus the active
 * task's hidden fields, which never reach the payload. The Explore lens's
 * are removed by `modalSample` instead.
 */
export const modalSampleView = selector({
  key: "modalSampleView",
  get: ({ get }) => [
    ...get(view),
    ...exclusionViewStages(get(taskSchemaWireExclusions)),
  ],
});

/**
 * The modal sample as fetched: without the active task's hidden fields,
 * with every other field (see `modalSample`).
 */
export const fetchedModalSample = graphQLSelector<
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
          `sample with group id ${variables.filter.id} and slice ${variables.filter.group.slices[0]} not found`,
        );
      }

      throw new SampleNotFound(
        `sample with id ${variables.filter.id} not found`,
      );
    }

    return mapSampleResponse(data.sample) as ModalSample;
  },
  variables: ({ get }) => {
    const current = get(modalSelector);

    if (current === null || current === undefined) return null;

    const slice = get(groupSlice);
    const sliceSelect = get(modalGroupSlice);

    if (get(hasGroupSlices) && (!slice || !sliceSelect)) {
      return null;
    }

    return {
      dataset: get(datasetName),
      view: get(modalSampleView),
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
 * The modal sample without the fields and attributes the Explore schema
 * lens hides (the task's never reach the payload).
 *
 * The lens's paths are removed here rather than excluded in the query: the
 * query's response is stored in one Relay record per sample whatever its
 * view, so a lens-specific query overwrote the record the other lenses
 * read, and switching back showed the fields still hidden. Removing them
 * here also means a lens switch never refetches the sample or reloads its
 * media, and a sample the lens hides nothing on keeps its identity.
 */
export const modalSample = selector<ModalSample>({
  key: "modalSampleWithoutHiddenPaths",
  get: ({ get }) => {
    const modal = get(fetchedModalSample);
    const sample = withoutPaths(modal.sample, get(lensWireExclusions) ?? []);
    return sample === modal.sample ? modal : { ...modal, sample };
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
  mapResponse: (data: ModalSampleResponse, { variables }) => {
    if (!data.sample) {
      if (variables.filter.group) {
        throw new GroupSampleNotFound(
          `sample with group id ${variables.filter.id} and slice ${variables.filter.group.slices[0]} not found`,
        );
      }

      throw new SampleNotFound(
        `sample with id ${variables.filter.id} not found`,
      );
    }

    return mapSampleResponse(data.sample) as ModalSample;
  },
  variables: ({ get }) => {
    const current = get(modalSelector);

    if (current === null || current === undefined) return null;

    const slice = get(groupSlice);

    if (get(hasGroupSlices) && !slice) {
      return null;
    }

    return {
      dataset: get(datasetName),
      view: get(modalSampleView),
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
