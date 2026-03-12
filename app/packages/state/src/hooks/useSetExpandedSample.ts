import type { ModalSelector } from "../session";

import { is3d } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { modalSelector } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";
import { useRenderConfig3dImperativeState } from "./useRenderConfig3d";

export default () => {
  const query = useRenderConfig3dImperativeState();

  const setter = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async (selector?: ModalSelector) => {
        // Modal sample changes should also reset any dynamic-group paging state.
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
        const currentModalSelector = snapshot
          .getLoadable(modalSelector)
          .getValue();
        let fallback = snapshot.getLoadable(groupAtoms.groupSlice).getValue();
        const currentModalSlice = snapshot
          .getLoadable(groupAtoms.modalGroupSlice)
          .getValue();
        const map = snapshot
          .getLoadable(groupAtoms.groupMediaTypesMap)
          .getValue();
        const types = snapshot
          .getLoadable(groupAtoms.groupMediaTypes)
          .getValue();

        // Preserve the current modal slice across sample-to-sample navigation only
        // if the destination group actually has that slice. Sparse groups can expose
        // a slice in one group that is missing from the next group in the sequence.
        if (
          selector?.groupId &&
          fallback &&
          currentModalSlice &&
          currentModalSlice !== fallback
        ) {
          const hasCurrentModalSlice = await snapshot.getPromise(
            groupAtoms.groupHasSampleOnSlice({
              groupId: selector.groupId,
              slice: currentModalSlice,
            })
          );

          if (!hasCurrentModalSlice) {
            set(groupAtoms.modalGroupSlice, fallback);
          }
        }

        if (is3d(map[fallback])) {
          const is3dPinned = await query.getIsPinned();
          // When a 3D slice is pinned in the modal, keep navigating within that
          // pinned slice instead of snapping back to the grid/default slice.
          if (is3dPinned && currentModalSelector && currentModalSlice) {
            fallback = currentModalSlice;
          } else {
            // Otherwise prefer a deterministic non-3D slice for the main viewer.
            fallback =
              types
                .filter(({ mediaType }) => !is3d(mediaType))
                .map(({ name }) => name)
                .sort()[0] ?? fallback;
          }

          set(groupAtoms.modalGroupSlice, fallback);
        }
      },
    [query]
  );

  const commit = useRecoilCallback(
    ({ set }) =>
      async (selector: ModalSelector) => {
        set(modalSelector, selector);
      },
    []
  );

  return useCallback(
    async (selector?: ModalSelector) => {
      await setter(selector);
      selector && commit(selector);
    },
    [commit, setter]
  );
};
