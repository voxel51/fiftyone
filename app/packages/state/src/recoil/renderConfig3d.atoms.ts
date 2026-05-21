/**
 * Internal 3D render config atoms and selectors.
 *
 * Keep this module unexported from package barrels. React consumers should use
 * `useRenderConfig3dState`, `useRenderConfig3dActions`, and
 * `useRenderConfig3dImperativeState` from `src/hooks/useRenderConfig3d.ts`.
 */
import { is3d, isFo3dSamplePath, setContains3d } from "@fiftyone/utilities";
import { get as getPath } from "lodash";
import { atom, selector } from "recoil";
import { getBrowserStorageEffectForKey } from "./customEffects";
import {
  isDynamicGroup,
  isNestedDynamicGroup,
  shouldRenderImaVidLooker,
} from "./dynamicGroups";
import {
  groupField,
  groupMediaTypes,
  groupMediaTypesSet,
  groupSamples,
  isGroup,
} from "./groups";
import {
  getGroupSampleMediaPath,
  getRepresentative3dSlice,
  resolveInteraction3dState,
} from "./groups.utils";
import { ModalSample, modalSample } from "./modal";
import { selectedMediaField } from "./options";

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
    const has3d = setContains3d(set);
    const isImaVidInNestedGroup =
      get(shouldRenderImaVidLooker(true)) && get(isNestedDynamicGroup);
    return get(groupMedia3dVisibleSetting) && has3d && !isImaVidInNestedGroup;
  },
});

export const pinned3DSampleSlice = atom<string | null>({
  key: "pinned3DSampleSlice",
  default: null,
});

export const is3dPinned = atom<boolean>({
  key: "is3dPinned",
  default: false,
});

export const has3dSlice = selector<boolean>({
  key: "has3dSlice",
  get: ({ get }) => {
    return setContains3d(get(groupMediaTypesSet));
  },
});

export const hasFo3dSlice = selector<boolean>({
  key: "hasFo3dSlice",
  get: ({ get }) => {
    return get(realFo3dSlices).length > 0;
  },
});

export const active3dSlices = atom<string[]>({
  key: "active3dSlices",
  default: [],
});

export const realFo3dSlices = selector<string[]>({
  key: "realFo3dSlices",
  get: ({ get }) => {
    if (!get(isGroup)) {
      return [];
    }

    const mediaField = get(selectedMediaField(true));

    return Object.entries(get(all3dSlicesToSampleMap))
      .filter(([, sample]) => {
        const mediaPath = getGroupSampleMediaPath(sample, mediaField);

        return (
          isFo3dSamplePath(mediaPath) ||
          isFo3dSamplePath(sample?.sample?.filepath)
        );
      })
      .map(([slice]) => slice);
  },
});

export const activeFo3dSlice = selector<string | null>({
  key: "activeFo3dSlice",
  get: ({ get }) => {
    const currentActive3dSlices = get(active3dSlices);
    const fo3dSliceSet = new Set(get(realFo3dSlices));
    const pinnedSlice = get(pinned3DSampleSlice);

    if (
      pinnedSlice &&
      (currentActive3dSlices.length === 0 ||
        currentActive3dSlices.includes(pinnedSlice)) &&
      fo3dSliceSet.has(pinnedSlice)
    ) {
      return pinnedSlice;
    }

    return (
      currentActive3dSlices.find((slice) => fo3dSliceSet.has(slice)) ?? null
    );
  },
});

export const activeNonFo3d3dSlices = selector<string[]>({
  key: "activeNonFo3d3dSlices",
  get: ({ get }) => {
    const fo3dSliceSet = new Set(get(realFo3dSlices));
    return get(active3dSlices).filter((slice) => !fo3dSliceSet.has(slice));
  },
});

export const active3dSlicesToSampleMap = selector<Record<string, ModalSample>>({
  key: "active3dSlicesToSampleMap",
  get: ({ get }) => {
    const active = get(active3dSlices);

    if (!active?.length) {
      return {
        default: get(modalSample),
      };
    }

    return Object.fromEntries(
      Object.entries(get(all3dSlicesToSampleMap)).filter(([slice]) =>
        active.includes(slice)
      )
    );
  },
});

export const all3dSlicesToSampleMap = selector<Record<string, ModalSample>>({
  key: "all3dSlicesToSampleMap",
  get: ({ get }) => {
    return Object.fromEntries<ModalSample>(
      get(threedSamples).map<[string, ModalSample]>((sample) => [
        getPath(sample.sample, `${get(groupField)}.name`) as unknown as string,
        sample as ModalSample,
      ])
    );
  },
});

export const interaction3dState = selector<
  ReturnType<typeof resolveInteraction3dState>
>({
  key: "interaction3dState",
  get: ({ get }) => {
    const isGrouped = get(isGroup);
    const currentActive3dSlices = get(active3dSlices);

    if (!isGrouped) {
      return resolveInteraction3dState({
        isGroup: false,
        modalSample: get(modalSample),
        activeSlices: currentActive3dSlices,
        activeSampleMap: {},
        allSampleMap: {},
        pinnedSlice: get(pinned3DSampleSlice),
      });
    }

    const allSampleMapValue = get(all3dSlicesToSampleMap);
    const sampleMap = currentActive3dSlices.length
      ? get(active3dSlicesToSampleMap)
      : allSampleMapValue;

    const representativeSlice = getRepresentative3dSlice({
      activeSlices: currentActive3dSlices,
      sampleMap,
      pinnedSlice: get(pinned3DSampleSlice),
    });

    // Defer reading modalSample — it may throw GroupSampleNotFound for jagged
    // multimodal groups where the current 2D slice doesn't exist in this group.
    // In those cases the representative sample comes from the 3D slice map instead.
    const representativeSample =
      (representativeSlice ? sampleMap[representativeSlice] : null) ??
      get(modalSample);

    return { sampleMap, representativeSlice, representativeSample };
  },
});

export const interaction3dSampleMap = selector<Record<string, ModalSample>>({
  key: "interaction3dSampleMap",
  get: ({ get }) => get(interaction3dState).sampleMap,
});

export const interaction3dSlice = selector<string | null>({
  key: "interaction3dSlice",
  get: ({ get }) => get(interaction3dState).representativeSlice,
});

export const interaction3dSample = selector<ModalSample>({
  key: "interaction3dSample",
  get: ({ get }) => get(interaction3dState).representativeSample,
});

export const all3dSlices = selector<string[]>({
  key: "all3dSlices",
  get: ({ get }) => {
    return get(groupMediaTypes)
      .filter(({ mediaType }) => is3d(mediaType))
      .map(({ name }) => name);
  },
});

export const allNon3dSlices = selector<string[]>({
  key: "allNon3dSlices",
  get: ({ get }) => {
    return get(groupMediaTypes)
      .filter(({ mediaType }) => !is3d(mediaType))
      .map(({ name }) => name);
  },
});

export const hasMultiple3dSlices = selector<boolean>({
  key: "hasMultiple3dSlices",
  get: ({ get }) => {
    return get(all3dSlices).length > 1;
  },
});

export const fo3dSlice = selector<string | null>({
  key: "fo3dSlice",
  get: ({ get }) => get(activeFo3dSlice),
});

export const fo3dContent = atom<unknown | null>({
  key: "fo3dContent",
  default: null,
});

export const sceneSample = selector<ModalSample>({
  key: "sceneSample",
  get: ({ get }) => {
    if (!get(isGroup)) {
      return get(modalSample);
    }

    if (get(isDynamicGroup) && !get(has3dSlice)) {
      return get(modalSample);
    }

    const renderedFo3dSlice = get(activeFo3dSlice);
    if (renderedFo3dSlice) {
      return get(all3dSlicesToSampleMap)[renderedFo3dSlice] ?? get(modalSample);
    }

    return get(interaction3dSample);
  },
});

export const threedSamples = selector<ModalSample[]>({
  key: "threedSamples",
  get: ({ get }) =>
    get(
      groupSamples({
        slices: get(all3dSlices),
        count: null,
        paginationData: false,
      })
    ),
});
