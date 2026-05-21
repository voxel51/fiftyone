import { ImaVidLooker } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import {
  datasetFragment,
  graphQLSyncFragmentAtom,
  groupSliceFragment,
  groupSliceFragment$key,
} from "@fiftyone/relay";
import { get as getPath } from "lodash";
import { VariablesOf } from "react-relay";
import {
  DefaultValue,
  atom,
  atomFamily,
  noWait,
  selector,
  selectorFamily,
} from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { getSessionRef, sessionAtom } from "../session";
import type { ResponseFrom } from "../utils";
import {
  mediaType,
  selectedLabels,
  selectedSamples,
  similarityParameters,
} from "./atoms";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { dataset } from "./dataset";
import {
  groupByFieldValue,
  imaVidLookerState,
  isDynamicGroup,
  isNestedDynamicGroup,
  shouldRenderImaVidLooker,
} from "./dynamicGroups";
import {
  GroupSampleNotFound,
  ModalSample,
  modalLooker,
  modalSample,
  modalSelector,
} from "./modal";
import { RelayEnvironmentKey } from "./relay";
import {
  active3dSlices,
  active3dSlicesToSampleMap,
  allNon3dSlices,
  fo3dSlice,
  has3dSlice,
  hasFo3dSlice,
  is3dPinned,
  pinned3DSampleSlice,
} from "./renderConfig3d.atoms";
import { datasetName, parentMediaTypeSelector } from "./selectors";
import { mapSampleResponse } from "./utils";
import * as viewAtoms from "./view";

/**
 * User setting controlling whether the carousel (filmstrip of group slices)
 * is visible in the modal.
 */
export const groupMediaIsCarouselVisibleSetting = atom<boolean>({
  key: "groupMediaIsCarouselVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIsCarouselVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

/**
 * Derived selector that determines if the carousel should actually be visible.
 * Combines user setting with contextual rules (e.g., hidden for ImaVid in nested groups).
 */
export const groupMediaIsCarouselVisible = selector<boolean>({
  key: "groupMediaIsCarouselVisible",
  get: ({ get }) => {
    const isImaVidInNestedGroup =
      get(shouldRenderImaVidLooker(true)) && get(isNestedDynamicGroup);

    return get(groupMediaIsCarouselVisibleSetting) && !isImaVidInNestedGroup;
  },
});

/**
 * User setting controlling whether the main 2D viewer
 * is visible in the modal for grouped datasets. Persisted to session storage.
 */
export const groupMediaIsMain2DViewerVisibleSetting = atom<boolean>({
  key: "groupMediaIsMain2DViewerVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIsMain2DViewerVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

/**
 * Derived selector that determines if the main viewer should actually be visible.
 * Combines user setting with contextual rules (shown when no 3D slices or multiple media types exist).
 */
export const groupMediaIsMain2DViewerVisible = selector<boolean>({
  key: "groupMediaIsMain2DViewerVisible",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    return (
      get(groupMediaIsMain2DViewerVisibleSetting) &&
      (!get(has3dSlice) || set.size > 1)
    );
  },
});

export const isGroup = selector<boolean>({
  key: "isGroup",
  get: ({ get }) => {
    return get(mediaType) === "group";
  },
});

export const sessionGroupSlice = sessionAtom({
  key: "sessionGroupSlice",
  default: null,
});

export const groupSlice = selector<string>({
  key: "groupSlice",
  get: ({ get }) => {
    return get(isGroup) && get(hasGroupSlices)
      ? get(sessionGroupSlice) || get(defaultGroupSlice)
      : null;
  },
  set: ({ get, reset, set }, slice) => {
    if (!get(similarityParameters)) {
      set(
        sessionGroupSlice,
        get(defaultGroupSlice) === slice ? new DefaultValue() : slice
      );
      set(selectedLabels, []);
      set(selectedSamples, new Map());

      return;
    }

    // avoid this pattern
    const unsubscribe = foq.subscribeBefore(() => {
      const session = getSessionRef();
      session.sessionGroupSlice =
        slice instanceof DefaultValue ? undefined : slice;
      session.selectedSamples = new Map();
      session.selectedLabels = [];

      unsubscribe();
    });
    reset(similarityParameters);
  },
});

export const defaultGroupSlice = graphQLSyncFragmentAtom<
  groupSliceFragment$key,
  string
>(
  {
    fragments: [datasetFragment, groupSliceFragment],
    keys: ["dataset"],
    read: (data) => {
      return data.defaultGroupSlice;
    },
    default: null,
  },
  {
    key: "defaultGroupSlice",
  }
);

export const modalGroupSlice = atom<string | null>({
  key: "modalGroupSlice",
  default: null,
});

export const groupMediaTypes = selector<{ name: string; mediaType: string }[]>({
  key: "groupMediaTypes",
  get: ({ get }) => {
    return get(isGroup) ? get(dataset).groupMediaTypes : [];
  },
});

/**
 * Mapping of slice names to their media types for grouped datasets.
 * E.g., { "left": "image", "right": "image", "lidar": "point_cloud" }
 */
export const groupMediaTypesMap = selector({
  key: "groupMediaTypesMap",
  get: ({ get }) =>
    Object.fromEntries(
      get(groupMediaTypes).map(({ name, mediaType }) => [name, mediaType])
    ),
});

export const groupSlices = selector({
  key: "groupSlices",
  get: ({ get }) => {
    if (get(hasGroupSlices)) {
      return get(groupMediaTypes)
        .map(({ name }) => name)
        .sort();
    }
    return [];
  },
});

/**
 * Slice names that actually exist for the currently opened modal group.
 *
 * This differs from {@link groupSlices}, which describes dataset-level slice
 * definitions. Sparse groups may omit some slices entirely, and annotate-mode
 * selectors should only offer slices that are present for the active group.
 */
export const currentGroupSliceNames = selector<string[]>({
  key: "currentGroupSliceNames",
  get: ({ get }) => {
    if (!get(hasGroupSlices) || !get(groupId)) {
      return [];
    }

    const slices = get(groupSlices);
    if (!slices.length) {
      return [];
    }

    const currentGroupField = get(groupField);
    const samples = get(
      groupSamples({
        slices,
        count: null,
        paginationData: false,
      })
    );
    const availableSliceSet = new Set(
      samples
        .map(
          (sample) =>
            getPath(sample.sample, `${currentGroupField}.name`) as unknown as
              | string
              | null
        )
        .filter(Boolean)
    );

    return slices.filter((slice) => availableSliceSet.has(slice));
  },
});

export const groupMediaTypesSet = selector<Set<string>>({
  key: "groupMediaTypesSet",
  get: ({ get }) =>
    new Set(get(groupMediaTypes).map(({ mediaType }) => mediaType)),
});

export const hasGroupSlices = selector<boolean>({
  key: "hasGroupSlices",
  get: ({ get }) => {
    return (
      get(isGroup) &&
      (!get(isDynamicGroup) || get(parentMediaTypeSelector) === "group")
    );
  },
});

export const currentSlice = selectorFamily<string | null, boolean>({
  key: "currentSlice",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;

      const slice = get(modal ? modalGroupSlice : groupSlice);

      if (!slice || (modal && get(is3dPinned))) {
        return get(pinned3DSampleSlice);
      }

      return slice;
    },
});

export const currentSlices = selectorFamily<string[] | null, boolean>({
  key: "currentSlices",
  get:
    (modal) =>
    ({ get }) => {
      if (!get(isGroup)) return null;
      const slice = get(modal ? modalGroupSlice : groupSlice);

      if (!slice || (modal && get(is3dPinned))) {
        return get(active3dSlices);
      }

      return [slice].filter((s) => s);
    },
});

export const activeSliceDescriptorLabel = selector<string>({
  key: "activeSliceDescriptorLabel",
  get: ({ get }) => {
    const currentSliceValue = get(currentSlice(true));
    const active3dSlicesValue = get(active3dSlices);

    if (!get(is3dPinned)) {
      return currentSliceValue;
    }

    const numActive3dSlices = active3dSlicesValue?.length;

    switch (numActive3dSlices) {
      case 1:
        return active3dSlicesValue[0];
      case 2:
        return `${active3dSlicesValue.join(" and ")}`;
      default:
        return `${numActive3dSlices} slices`;
    }
  },
});

export const groupField = selector<string>({
  key: "groupField",
  get: ({ get }) => get(dataset)?.groupField,
});

export const groupId = selector<string>({
  key: "groupId",
  get: ({ get }) => get(modalSelector)?.groupId || null,
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
        view: get(viewAtoms.view),
        dynamicGroup: get(groupByFieldValue),
        filter: {
          group: {
            slice: get(groupSlice),
            id: groupIdValue,
            slices: slices ?? [],
          },
        },
        paginationData,
      };
    },
  mapResponse: (data: ResponseFrom<foq.paginateSamplesQuery>) => {
    if (!foq.isPaginateSamplesConnection(data.samples)) {
      return [];
    }
    return data.samples.edges.map((edge) => {
      return mapSampleResponse(edge.node as ModalSample);
    });
  },
});

export const non3dSamples = selector({
  key: "non3dSamples",
  get: ({ get }) =>
    get(groupSamples({ slices: get(allNon3dSlices), count: 1 })),
});

export const groupHasSampleOnSlice = graphQLSelectorFamily<
  VariablesOf<foq.paginateSamplesQuery>,
  { groupId: string | null; slice: string | null },
  boolean | null
>({
  key: "groupHasSampleOnSlice",
  environment: RelayEnvironmentKey,
  query: foq.paginateSamples,
  variables:
    ({ groupId, slice }) =>
    ({ get }) => {
      if (!groupId || !slice) {
        return null;
      }

      return {
        count: 1,
        dataset: get(datasetName),
        view: get(viewAtoms.view),
        dynamicGroup: get(groupByFieldValue),
        filter: {
          group: {
            slice,
            id: groupId,
            slices: [slice],
          },
        },
        paginationData: false,
      };
    },
  mapResponse: (data: ResponseFrom<foq.paginateSamplesQuery>) => {
    if (!foq.isPaginateSamplesConnection(data.samples)) {
      return false;
    }
    return data.samples.edges.length > 0;
  },
});

export const fo3dSample = selector({
  key: "fo3dSample",
  get: ({ get }) => {
    if (!get(isGroup)) return get(modalSample);

    if (get(isDynamicGroup) && !get(hasFo3dSlice)) {
      return get(modalSample);
    }

    if (!get(hasFo3dSlice)) return null;

    const sample = get(
      groupSamples({
        slices: [get(fo3dSlice)],
        count: 1,
        paginationData: false,
      })
    )[0];

    return sample;
  },
});

export const activeModalSample = selector({
  key: "activeModalSample",
  get: ({ get }) => {
    if (get(is3dPinned)) {
      if (get(hasFo3dSlice)) {
        return get(fo3dSample).sample;
      }

      const slices = get(active3dSlices);
      const key = slices.length === 1 ? slices[0] : get(pinned3DSampleSlice);
      return get(active3dSlicesToSampleMap)[key]?.sample;
    }

    if (get(isGroup)) {
      // Use noWait to catch GroupSampleNotFound for jagged multimodal groups
      // where the active 2D slice is absent in this particular group, without
      // crashing the UI. For other states (loading, other errors), fall through
      // to get(modalSample) to preserve normal suspension behavior.
      const loadable = get(noWait(modalSample));
      if (loadable.state === "hasError") {
        if (loadable.contents instanceof GroupSampleNotFound) return null;
        throw loadable.contents;
      }
      return get(modalSample)?.sample ?? null;
    }

    return get(modalSample).sample;
  },
});

export const activeModalSidebarSample = selector({
  key: "activeModalSidebarSample",
  get: ({ get }) => {
    if (get(shouldRenderImaVidLooker(true))) {
      const currentFrameNumber = get(imaVidLookerState("currentFrameNumber"));

      if (!currentFrameNumber) {
        return get(activeModalSample);
      }

      const currentModalLooker = get(modalLooker) as ImaVidLooker;

      const sampleId =
        currentModalLooker?.frameStoreController?.store.frameIndex.get(
          currentFrameNumber
        );
      const sample =
        currentModalLooker?.frameStoreController?.store.samples.get(sampleId);
      return sample?.sample ?? get(activeModalSample);
    }

    return get(activeModalSample);
  },
});

export const groupStatistics = atomFamily<"group" | "slice", boolean>({
  key: "groupStatistics",
  default: "slice",
});
