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
  imaVidLookerState,
  isDynamicGroup,
  isNestedDynamicGroup,
  shouldRenderImaVidLooker,
} from "./dynamicGroups";
import { ModalSample, modalLooker, modalSample } from "./modal";
import { RelayEnvironmentKey } from "./relay";
import { datasetName, parentMediaTypeSelector } from "./selectors";
import { State } from "./types";
import { mapSampleResponse } from "./utils";
import * as viewAtoms from "./view";

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

export const groupMediaIsCarouselVisible = selector<boolean>({
  key: "groupMediaIsCarouselVisible",
  get: ({ get }) => {
    const isImaVidInNestedGroup =
      get(shouldRenderImaVidLooker) && get(isNestedDynamicGroup);

    return get(groupMediaIsCarouselVisibleSetting) && !isImaVidInNestedGroup;
  },
});

export const groupMedia3dVisibleSetting = atom<boolean>({
  key: "groupMediaIs3dVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIs3DVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

export const groupMediaIs3dVisible = selector<boolean>({
  key: "groupMedia3dVisible",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    const hasPcd = set.has("point_cloud");
    const isImaVidInNestedGroup =
      get(shouldRenderImaVidLooker) && get(isNestedDynamicGroup);
    return get(groupMedia3dVisibleSetting) && hasPcd && !isImaVidInNestedGroup;
  },
});

export const groupMediaIsMainVisibleSetting = atom<boolean>({
  key: "groupMediaIsMainVisibleSetting",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("groupMediaIsMainVisible", {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

export const groupMediaIsMainVisible = selector<boolean>({
  key: "groupMediaIsMainVisible",
  get: ({ get }) => {
    const set = get(groupMediaTypesSet);
    const hasPcd = set.has("point_cloud");
    return get(groupMediaIsMainVisibleSetting) && (!hasPcd || set.size > 1);
  },
});

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
    return get(isGroup) && get(hasGroupSlices) ? get(sessionGroupSlice) : null;
  },
  set: ({ get, reset, set }, slice) => {
    const defaultSlice = get(defaultGroupSlice);
    if (get(similarityParameters)) {
      // avoid this pattern
      const unsubscribe = foq.subscribeBefore(() => {
        const session = getSessionRef();
        session.sessionGroupSlice =
          slice instanceof DefaultValue ? defaultSlice : slice;
        session.selectedSamples = new Set();
        session.selectedLabels = [];

        unsubscribe();
      });
      reset(similarityParameters);
    } else {
      set(sessionGroupSlice, slice);
      set(selectedLabels, []);
      set(selectedSamples, new Set());
    }
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

export const modalGroupSlice = atom<string>({
  key: "modalGroupSlice",
  default: null,
});

export const groupMediaTypes = selector<{ name: string; mediaType: string }[]>({
  key: "groupMediaTypes",
  get: ({ get }) => {
    return get(isGroup) ? get(dataset).groupMediaTypes : [];
  },
});

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

      const slice = get(modal ? modalGroupSlice : groupSlice);

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
      const slice = get(modal ? modalGroupSlice : groupSlice);

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
  get: ({ get }) => get(dataset)?.groupField,
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
        view: get(groupView),
        filter: {
          group: {
            slice: get(groupSlice),
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

export const activeModalSample = selector({
  key: "activeModalSample",
  get: ({ get }) => {
    if (get(pinned3d)) {
      const slices = get(activePcdSlices);
      const key = slices.length === 1 ? slices[0] : get(pinned3DSampleSlice);
      return get(activePcdSlicesToSampleMap)[key]?.sample;
    }

    return get(modalSample).sample;
  },
});

export const activeModalSidebarSample = selector({
  key: "activeModalSidebarSample",
  get: ({ get }) => {
    if (get(shouldRenderImaVidLooker)) {
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

/**
 * A group view, i.e. all slices of a group, can potentially be of a dynamic
 * group. The GroupBy stage is filtered to accomodate this
 */
export const groupView = selector<State.Stage[]>({
  key: "groupView",
  get: ({ get }) =>
    get(viewAtoms.view).filter(
      (stage) => stage._cls !== viewAtoms.GROUP_BY_VIEW_STAGE
    ),
});
