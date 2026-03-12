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
      async () => {
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

        if (is3d(map[fallback])) {
          const is3dPinned = await query.getIsPinned();
          if (is3dPinned && currentModalSelector && currentModalSlice) {
            fallback = currentModalSlice;
          } else {
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
      await setter();
      selector && commit(selector);
    },
    [commit, setter]
  );
};
