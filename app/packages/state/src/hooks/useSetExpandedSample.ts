import { useCallback, useRef } from "react";
import {
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";
import { currentModalSample } from "../recoil";
import * as dynamicGroupAtoms from "../recoil/dynamicGroups";
import * as groupAtoms from "../recoil/groups";

export default () => {
  const types = useRecoilValue(groupAtoms.groupMediaTypes);
  const map = useRecoilValue(groupAtoms.groupMediaTypesMap);
  const groupSlice = useRecoilValue(groupAtoms.groupSlice);
  const r = useRef(groupSlice);
  r.current = groupSlice;
  const setter = useRecoilTransaction_UNSTABLE(
    ({ reset, set }) =>
      (groupByFieldValue?: string) => {
        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupAtoms.dynamicGroupCurrentElementIndex);
        groupByFieldValue !== undefined &&
          set(dynamicGroupAtoms.groupByFieldValue, groupByFieldValue);

        let fallback = r.current;
        if (map[fallback] === "point_cloud") {
          fallback = types
            .filter(({ mediaType }) => mediaType !== "point_cloud")
            .map(({ name }) => name)
            .sort()[0];
        }
        set(groupAtoms.modalGroupSlice, fallback);
      },
    [r, map, types]
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
