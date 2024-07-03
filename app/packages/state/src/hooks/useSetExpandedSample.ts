import { useCallback } from "react";
import { useRecoilCallback } from "recoil";
import { currentModalSample } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";

export default () => {
  const setter = useRecoilCallback(
    ({ reset, set, snapshot }) =>
      (groupByFieldValue?: string) => {
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
        groupByFieldValue !== undefined &&
          set(dynamicGroupAtoms.groupByFieldValue, groupByFieldValue);

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
      async (data: { groupId?: string; id: string }) => {
        set(currentModalSample, data);
      },
    []
  );

  return useCallback(
    (data: { groupId?: string; id: string }) => {
      setter(data.groupId);
      commit(data);
    },
    [commit, setter]
  );
};
