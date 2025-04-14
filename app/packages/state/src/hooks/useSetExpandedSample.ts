import type { ModalSelector } from "../session";

import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { modalSelector } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";
import { is3d } from "@fiftyone/utilities";

export default () => {
  const setter = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      async () => {
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
        let fallback = snapshot.getLoadable(groupAtoms.groupSlice).getValue();
        const map = snapshot
          .getLoadable(groupAtoms.groupMediaTypesMap)
          .getValue();
        const types = snapshot
          .getLoadable(groupAtoms.groupMediaTypes)
          .getValue();

        if (is3d(map[fallback])) {
          fallback = types
            .filter(({ mediaType }) => !is3d(mediaType))
            .map(({ name }) => name)
            .sort()[0];

          set(groupAtoms.modalGroupSlice, fallback);
        }
      },
    []
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
