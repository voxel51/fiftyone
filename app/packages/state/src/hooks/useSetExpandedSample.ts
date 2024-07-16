import type { ModalSelector } from "../session";

import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { currentModalSample } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";

export default () => {
  const setter = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      () => {
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
        let fallback = snapshot.getLoadable(groupAtoms.groupSlice).getValue();
        const map = snapshot
          .getLoadable(groupAtoms.groupMediaTypesMap)
          .getValue();
        const types = snapshot
          .getLoadable(groupAtoms.groupMediaTypes)
          .getValue();
        if (map[fallback] === "point_cloud") {
          fallback = types
            .filter(({ mediaType }) => mediaType !== "point_cloud")
            .map(({ name }) => name)
            .sort()[0];
        }
        set(groupAtoms.modalGroupSlice, fallback);
      },
    []
  );

  const commit = useRecoilCallback(
    ({ set }) =>
      async (selector: ModalSelector) => {
        set(currentModalSample, selector);
      },
    []
  );

  return useCallback(
    (selector: ModalSelector) => {
      setter();
      commit(selector);
    },
    [commit, setter]
  );
};
