import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import {
  currentModalNavigation,
  currentModalSample,
  dynamicGroupCurrentElementIndex,
} from "../recoil";
import * as groupAtoms from "../recoil/groups";

export default () => {
  const setter = useRecoilTransaction_UNSTABLE(
    ({ reset, set }) =>
      (
        id: string,
        index: number,
        groupId?: string,
        groupByFieldValue?: string
      ) => {
        set(currentModalSample, { id, index });
        reset(groupAtoms.nestedGroupIndex);
        reset(dynamicGroupCurrentElementIndex);
        groupId && set(groupAtoms.groupId, groupId);
        groupByFieldValue &&
          set(groupAtoms.groupByFieldValue, groupByFieldValue);
      },
    []
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
