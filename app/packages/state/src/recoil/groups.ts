import { ImaVidLooker } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import {
  datasetFragment,
  graphQLSyncFragmentAtom,
  groupSliceFragment,
  groupSliceFragment$key,
} from "@fiftyone/relay";
import {
  DYNAMIC_GROUP_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  GROUP,
  LIST_FIELD,
  Stage,
} from "@fiftyone/utilities";
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
import { mediaType, similarityParameters } from "./atoms";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { dataset } from "./dataset";
import { ModalSample, modalLooker, modalSample } from "./modal";
import { nonNestedDynamicGroupsViewMode } from "./options";
import { RelayEnvironmentKey } from "./relay";
import { fieldPaths } from "./schema";
import { datasetName, parentMediaTypeSelector } from "./selectors";
import { State } from "./types";
import { mapSampleResponse } from "./utils";
import { GROUP_BY_VIEW_STAGE, dynamicGroupViewQuery, view } from "./view";

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
    return get(groupMedia3dVisibleSetting) && hasPcd;
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
        getSessionRef().sessionGroupSlice =
          slice instanceof DefaultValue ? defaultSlice : slice;
        unsubscribe();
      });
      reset(similarityParameters);
    } else {
      set(sessionGroupSlice, slice);
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
        view: get(view),
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

export const groupByFieldValue = atom<string | null>({
  key: "groupByFieldValue",
  default: null,
});

export const dynamicGroupIndex = atom<number>({
  key: "dynamicGroupIndex",
  default: null,
});

export const dynamicGroupCurrentElementIndex = atom<number>({
  key: "dynamicGroupCurrentElementIndex",
  default: 1,
});

export const dynamicGroupParameters =
  selector<State.DynamicGroupParameters | null>({
    key: "dynamicGroupParameters",
    get: ({ get }) => {
      const viewArr = get(view);
      if (!viewArr) return null;

      const groupByViewStageNode = viewArr.find(
        (view) => view._cls === GROUP_BY_VIEW_STAGE
      );
      if (!groupByViewStageNode) return null;

      const isFlat = groupByViewStageNode.kwargs[2][1]; // third index is 'flat', we want it to be false for dynamic groups
      if (isFlat) return null;

      return {
        groupBy: groupByViewStageNode.kwargs[0][1] as string, // first index is 'field_or_expr', which defines group-by
        orderBy: groupByViewStageNode.kwargs[1][1] as string, // second index is 'order_by', which defines order-by
      };
    },
  });

export const isDynamicGroup = selector<boolean>({
  key: "isDynamicGroup",
  get: ({ get }) => {
    return Boolean(get(dynamicGroupParameters));
  },
});

export const isNonNestedDynamicGroup = selector<boolean>({
  key: "isNonNestedDynamicGroup",
  get: ({ get }) => {
    return get(isDynamicGroup) && get(parentMediaTypeSelector) !== "group";
  },
});

export const isImaVidLookerAvailable = selector<boolean>({
  key: "isImaVidLookerAvailable",
  get: ({ get }) => {
    const isOrderedDynamicGroup_ = get(isOrderedDynamicGroup);
    const isNonNestedDynamicGroup_ = get(isNonNestedDynamicGroup);
    return isOrderedDynamicGroup_ && isNonNestedDynamicGroup_;
  },
});

export const shouldRenderImaVidLooker = selector<boolean>({
  key: "shouldRenderImaVidLooker",
  get: ({ get }) => {
    return (
      get(isImaVidLookerAvailable) &&
      get(nonNestedDynamicGroupsViewMode) === "video"
    );
  },
});

export const isOrderedDynamicGroup = selector<boolean>({
  key: "isOrderedDynamicGroup",
  get: ({ get }) => {
    const params = get(dynamicGroupParameters);
    if (!params) return false;

    const { orderBy } = params;
    return Boolean(orderBy?.length);
  },
});

export const dynamicGroupPageSelector = selectorFamily<
  (
    cursor: number,
    pageSize: number
  ) => {
    filter: Record<string, never>;
    after: string;
    count: number;
    dataset: string;
    view: Stage[];
  },
  string
>({
  key: "paginateDynamicGroupVariables",
  get:
    (groupByValue) =>
    ({ get }) => {
      const params = {
        dataset: get(datasetName),
        view: get(
          dynamicGroupViewQuery({ groupByFieldValueExplicit: groupByValue })
        ),
      };

      return (cursor: number, pageSize: number) => ({
        ...params,
        filter: {},
        after: cursor ? String(cursor) : null,
        count: pageSize,
      });
    },
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

export const imaVidLookerState = atomFamily<any, string>({
  key: "imaVidLookerState",
  default: null,
  effects: (key) => [
    ({ setSelf, getPromise, onSet }) => {
      let unsubscribe;

      onSet((_newValue, oldValue, isReset) => {
        // note: resetRecoilState is not triggering `onSet` in effect,
        // see https://github.com/facebookexperimental/Recoil/issues/2183
        // replace with `useResetRecoileState` when fixed

        // if (!isReset) {
        //   throw new Error("cannot set ima-vid state directly");
        // }
        unsubscribe && unsubscribe();

        getPromise(modalLooker)
          .then((looker: ImaVidLooker) => {
            if (looker) {
              unsubscribe = looker.subscribeToState(key, (stateValue) => {
                setSelf(stateValue);
              });
            }
          })
          .catch((e) => {
            console.error(e);
          });
      });

      return () => {
        unsubscribe();
      };
    },
  ],
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

    return filtered;
  },
});
