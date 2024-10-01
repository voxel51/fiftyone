import type { ModalSelector } from "../session";

import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { modalSelector } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";

const THREE_D = new Set(["point_cloud", "three_d"]);

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

        if (THREE_D.has(map[fallback])) {
          fallback = types
            .filter(({ mediaType }) => !THREE_D.has(mediaType))
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
