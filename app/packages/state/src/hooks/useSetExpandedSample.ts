import type { ModalSelector } from "../session";

import { is3d } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { modalSelector } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";
import { useRenderConfig3dImperativeState } from "./useRenderConfig3d";

/**
 * Source used when expanding a sample directly from the grid / routing.
 */
export const SET_EXPANDED_SAMPLE_SOURCE_OPEN = "open" as const;

/**
 * Source used when moving between samples inside the modal.
 */
export const SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION = "navigation" as const;

type SetExpandedSampleOptions = {
  source?:
    | typeof SET_EXPANDED_SAMPLE_SOURCE_OPEN
    | typeof SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION;
};

type GroupMediaType = { name: string; mediaType: string };

const canPreserveCurrentModalSlice = ({
  currentModalSlice,
  groupSlice,
  groupMediaTypes,
  destinationHasCurrentModalSlice,
}: {
  currentModalSlice: string | null;
  groupSlice: string;
  groupMediaTypes: GroupMediaType[];
  destinationHasCurrentModalSlice: boolean | null;
}) => {
  if (
    !currentModalSlice ||
    !groupMediaTypes.some(({ name }) => name === currentModalSlice)
  ) {
    return false;
  }

  if (currentModalSlice === groupSlice) {
    return true;
  }

  return destinationHasCurrentModalSlice === true;
};

/**
 * Checks which relevant slices are available on the destination group.
 * This matters because groups might be sparse (as in, not contain all the
 * slices of the previous group).
 */
const resolveDestinationSliceHints = async ({
  destinationGroupId,
  groupSlice,
  currentModalSlice,
  baselineIs3d,
  non3dSliceNames,
  hasSliceOnDestinationGroup,
}: {
  destinationGroupId: string | null;
  groupSlice: string | null;
  currentModalSlice: string | null;
  baselineIs3d: boolean;
  non3dSliceNames: string[];
  hasSliceOnDestinationGroup: (slice: string) => Promise<boolean | null>;
}): Promise<{
  destinationHasCurrentModalSlice: boolean | null;
  fallbackNon3dSlice: string | null;
}> => {
  let destinationHasCurrentModalSlice: boolean | null = null;
  const datasetFirstNon3dSlice = non3dSliceNames[0] ?? null;

  if (
    destinationGroupId &&
    groupSlice &&
    currentModalSlice &&
    currentModalSlice !== groupSlice
  ) {
    destinationHasCurrentModalSlice = await hasSliceOnDestinationGroup(
      currentModalSlice
    );
  }

  if (!destinationGroupId || !baselineIs3d || !non3dSliceNames.length) {
    return {
      destinationHasCurrentModalSlice,
      fallbackNon3dSlice: datasetFirstNon3dSlice,
    };
  }

  const availableNon3dSlices = await Promise.all(
    non3dSliceNames.map(async (slice) => ({
      slice,
      exists: await hasSliceOnDestinationGroup(slice),
    }))
  );

  return {
    destinationHasCurrentModalSlice,
    fallbackNon3dSlice:
      availableNon3dSlices.find(({ exists }) => exists === true)?.slice ?? null,
  };
};

/**
 * Resolves `modalGroupSlice`, the grouped sample shown in the modal's main
 * 2D/annotation view.
 */
export const resolveModalMain2dSlice = ({
  groupSlice,
  currentModalSlice,
  groupMediaTypes,
  hasExistingModal,
  baselineIs3d,
  fallbackNon3dSlice,
  is3dPinned,
  destinationHasCurrentModalSlice,
}: {
  groupSlice: string | null;
  currentModalSlice: string | null;
  groupMediaTypes: GroupMediaType[];
  hasExistingModal: boolean;
  baselineIs3d: boolean;
  fallbackNon3dSlice: string | null;
  is3dPinned: boolean;
  destinationHasCurrentModalSlice: boolean | null;
}): string | null => {
  if (!groupSlice) {
    return currentModalSlice;
  }

  if (!hasExistingModal) {
    return baselineIs3d ? fallbackNon3dSlice ?? groupSlice : groupSlice;
  }

  if (
    canPreserveCurrentModalSlice({
      currentModalSlice,
      groupSlice,
      groupMediaTypes,
      destinationHasCurrentModalSlice,
    })
  ) {
    return currentModalSlice;
  }

  if (!baselineIs3d) {
    return groupSlice;
  }

  if (is3dPinned) {
    return groupSlice;
  }

  return fallbackNon3dSlice ?? groupSlice;
};

/**
 * Synchronizes `modalGroupSlice`, which selects the grouped sample that backs
 * the modal's main 2D sample view.
 *
 * Note: this logic is too complex and fragile because of having to account for separate 3d state
 * plane, having to account for sparse groups, and 2d-3d click transitions.
 * TODO (tracked internally): Create unified grouped modal state model so 2D and
 * 3D flows are coordinated by one explicit intent-driven policy layer rather
 * than scattered hook logic.
 */
export default () => {
  const renderStateQuery3d = useRenderConfig3dImperativeState();

  const setModalMainSlice = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async (
        selector?: ModalSelector,
        options: SetExpandedSampleOptions = {}
      ) => {
        // This hook runs for both:
        // 1) opening modal from grid (no current modal selector yet)
        // 2) modal next/previous navigation (existing modal selector present)
        // The resolver handles both cases with a single precedence order.

        // Modal sample changes should also reset any dynamic-group paging state.
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);

        const destinationGroupId = selector?.groupId ?? null;
        const isModalNavigation =
          options.source === SET_EXPANDED_SAMPLE_SOURCE_NAVIGATION;
        const groupSlice = snapshot
          .getLoadable(groupAtoms.groupSlice)
          .getValue();
        const currentModalSlice = snapshot
          .getLoadable(groupAtoms.modalGroupSlice)
          .getValue();
        const groupMediaTypes = snapshot
          .getLoadable(groupAtoms.groupMediaTypes)
          .getValue();

        const non3dSliceNames = groupMediaTypes
          .filter(({ mediaType }) => !is3d(mediaType))
          .map(({ name }) => name)
          .sort();

        const hasSliceOnDestinationGroup = async (
          slice: string
        ): Promise<boolean | null> =>
          destinationGroupId
            ? snapshot.getPromise(
                groupAtoms.groupHasSampleOnSlice({
                  groupId: destinationGroupId,
                  slice,
                })
              )
            : false;

        // Media type of the grid-selected baseline slice.
        const baselineMediaType =
          groupMediaTypes.find(({ name }) => name === groupSlice)?.mediaType ??
          "";
        // Whether the baseline slice is a 3D slice.
        const baselineIs3d = Boolean(groupSlice && is3d(baselineMediaType));

        const { destinationHasCurrentModalSlice, fallbackNon3dSlice } =
          await resolveDestinationSliceHints({
            destinationGroupId,
            groupSlice,
            currentModalSlice,
            baselineIs3d,
            non3dSliceNames,
            hasSliceOnDestinationGroup,
          });

        // For 3D baselines, pin state controls the 3D viewer while
        // `modalGroupSlice` still resolves the modal's main 2D sample.
        const is3dPinned = baselineIs3d
          ? await renderStateQuery3d.getIsPinned()
          : false;
        const nextModalSlice = resolveModalMain2dSlice({
          groupSlice,
          currentModalSlice,
          groupMediaTypes,
          hasExistingModal: isModalNavigation,
          baselineIs3d,
          fallbackNon3dSlice,
          is3dPinned,
          destinationHasCurrentModalSlice,
        });

        // Avoid redundant atom writes to keep modal transitions predictable and cheap.
        if (nextModalSlice && nextModalSlice !== currentModalSlice) {
          set(groupAtoms.modalGroupSlice, nextModalSlice);
        }
      },
    [renderStateQuery3d]
  );

  const commitModalSelector = useRecoilCallback(
    ({ set }) =>
      async (selector: ModalSelector) => {
        set(modalSelector, selector);
      },
    []
  );

  return useCallback(
    async (
      selector?: ModalSelector,
      options: SetExpandedSampleOptions = {}
    ) => {
      // Resolve the main modal group member first, then commit selector. This
      // keeps `modalSample` aligned with the final `modalGroupSlice`, while
      // grouped 3D viewer state continues to come from the dedicated 3D atoms.
      await setModalMainSlice(selector, options);
      selector && commitModalSelector(selector);
    },
    [commitModalSelector, setModalMainSlice]
  );
};
