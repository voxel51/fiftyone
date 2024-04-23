import { useRef } from "react";
import {
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";
import {
  currentModalNavigation,
  currentModalSample,
  dynamicGroupCurrentElementIndex,
} from "../recoil";
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
      (
        id: string,
        index: number,
        groupId?: string,
        groupByFieldValue?: string
      ) => {
        set(groupAtoms.groupId, groupId || null);
        set(currentModalSample, { id, index });

        reset(dynamicGroupAtoms.dynamicGroupIndex);
        reset(dynamicGroupCurrentElementIndex);
        groupByFieldValue &&
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

  return useRecoilCallback(
    ({ snapshot }) =>
      async (index: number | ((current: number) => number)) => {
        const current = await snapshot.getPromise(currentModalSample);
        if (index instanceof Function) {
          index = index(current.index);
        }
        const { id, groupId, groupByFieldValue } = await (
          await snapshot.getPromise(currentModalNavigation)
        )(index);

        setter(id, index, groupId, groupByFieldValue);
      },
    [setter]
  );
};
