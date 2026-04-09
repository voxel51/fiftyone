import type { ModalSelector } from "../session";

import { is3d } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { modalSelector } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";
import { resolveModalGroupSlice } from "./useSetExpandedSample.utils";
import { useRenderConfig3dImperativeState } from "./useRenderConfig3d";

export default () => {
  const query = useRenderConfig3dImperativeState();

  const setter = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async (selector?: ModalSelector) => {
        // This hook runs for both:
        // 1) opening modal from grid (no current modal selector yet)
        // 2) modal next/previous navigation (existing modal selector present)
        // The resolver handles both cases with a single precedence order.

        // Modal sample changes should also reset any dynamic-group paging state.
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
        const currentModalSelector = snapshot
          .getLoadable(modalSelector)
          .getValue();
        const hasExistingModal = Boolean(currentModalSelector);
        const groupSlice = snapshot
          .getLoadable(groupAtoms.groupSlice)
          .getValue();
        const currentModalSlice = snapshot
          .getLoadable(groupAtoms.modalGroupSlice)
          .getValue();
        const map = snapshot
          .getLoadable(groupAtoms.groupMediaTypesMap)
          .getValue();
        const types = snapshot
          .getLoadable(groupAtoms.groupMediaTypes)
          .getValue();

        let destinationHasCurrentModalSlice: boolean | null = null;

        // Preserve the current modal slice across sample-to-sample navigation only
        // if the destination group actually has that slice. Sparse groups can expose
        // a slice in one group that is missing from the next group in the sequence.
        //
        // We only query when current modal slice differs from the baseline grid slice.
        // If they already match, destination compatibility is implied by baseline.
        if (
          selector?.groupId &&
          groupSlice &&
          currentModalSlice &&
          currentModalSlice !== groupSlice
        ) {
          destinationHasCurrentModalSlice = await snapshot.getPromise(
            groupAtoms.groupHasSampleOnSlice({
              groupId: selector.groupId,
              slice: currentModalSlice,
            })
          );
        }

        // Pin state only matters when baseline slice is 3D. For non-3D baselines,
        // the resolver ignores pin state and uses 2D/normal grouped precedence.
        const is3dPinned =
          groupSlice && is3d(map[groupSlice])
            ? await query.getIsPinned()
            : false;

        const nextModalSlice = resolveModalGroupSlice({
          groupSlice,
          currentModalSlice,
          groupMediaTypes: types,
          groupMediaTypesMap: map,
          hasExistingModal,
          is3dPinned,
          destinationHasCurrentModalSlice,
        });

        // Avoid redundant atom writes to keep modal transitions predictable and cheap.
        if (nextModalSlice && nextModalSlice !== currentModalSlice) {
          set(groupAtoms.modalGroupSlice, nextModalSlice);
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
      // Resolve slice first, then commit selector. This keeps modal sample lookup
      // aligned with the final chosen slice for the destination sample.
      await setter(selector);
      selector && commit(selector);
    },
    [commit, setter]
  );
};
