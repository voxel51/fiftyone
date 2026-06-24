import { PointInfo, type Sample } from "@fiftyone/looker";
import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, noWait, selector, selectorFamily } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { fetchSamples } from "../fetchers/samples";
import type { Lookers } from "../hooks";
import { stores } from "../hooks";
import { ComputeCoordinatesReturnType } from "../hooks/useTooltip";
import { ModalSelector, sessionAtom } from "../session";
import { ResponseFrom } from "../utils";
import { filters } from "./filters";
import { datasetId } from "./selectors";
import {
  imaVidLookerState,
  shouldRenderImaVidLooker,
  videoLookerState,
} from "./dynamicGroups";
import { isVideoDataset } from "./selectors";
import {
  activeModalSidebarSample,
  groupId,
  groupSlice,
  hasGroupSlices,
  modalGroupSlice,
} from "./groups";
import { RelayEnvironmentKey } from "./relay";
import { modalSampleExclude } from "./sampleProjection";
import {
  interaction3dSample,
  is3dPinned,
  pinned3DSampleSlice,
} from "./renderConfig3d.atoms";
import { datasetName } from "./selectors";
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
        const id = sample?.id || sample?._id || (sample?.sample?._id as string);
        if (id) {
          return id;
        }
      }

      // hold the sidebar sample steady while playing/seeking
      return null;
    }

    if (get(isVideoDataset)) {
      // native video: don't compute sidebar counts during playback/seek; settle on the
      // frame it stopped on (the frame's labels are already in the streamed frame store)
      if (
        get(videoLookerState("playing")) ||
        get(videoLookerState("seeking"))
      ) {
        return null;
      }
      return get(modalSampleId);
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

const modalSampleQuery = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ModalSample
>({
  environment: RelayEnvironmentKey,
  key: "modalSampleQuery",
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

// Returns a hydrated grid sample from the shared `stores` cache (keyed by id);
// a miss falls back to the `mainSample` query.
const getCachedModalSample = (id: string): ModalSample | undefined => {
  for (const store of stores) {
    const cached = store.samples.get(id);
    if (cached) {
      return cached;
    }
  }
  return undefined;
};

// The non-label complement for a sample id, fetched async via the REST route. The
// looker reads it non-blocking (noWait); the sidebar awaits it. Deduped per id.
export const modalSampleComplement = selectorFamily<
  Record<string, unknown>,
  string
>({
  key: "modalSampleComplement",
  get:
    (id) =>
    async ({ get }) => {
      const dataset = get(datasetId);
      if (!dataset) {
        return {};
      }

      const result = await fetchSamples({
        datasetId: dataset,
        ids: [id],
        exclude: get(modalSampleExclude),
        view: get(view),
        filters: get(filters),
      });
      return result[0]?.fields ?? {};
    },
});

export const modalSample = selector<ModalSample>({
  key: "modalSample",
  get: ({ get }) => {
    const current = get(modalSelector);
    if (current !== null) {
      const cached = getCachedModalSample(current.id);
      if (cached) {
        // merge in the complement's non-label fields once available; noWait so the
        // looker is never blocked on it
        const loadable = get(noWait(modalSampleComplement(current.id)));
        if (loadable.state === "hasValue") {
          return {
            ...cached,
            sample: { ...cached.sample, ...loadable.contents },
          };
        }
        return cached;
      }
    }
    return get(modalSampleQuery);
  },
});

/** Like {@link modalSample} but pinned to the dataset's main `groupSlice`. */
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
