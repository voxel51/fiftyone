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
import * as groupAtoms from "../recoil/groups";

export default () => {
  const types = useRecoilValue(groupAtoms.groupMediaTypes);
  const map = useRecoilValue(groupAtoms.groupMediaTypesMap);

  const setter = useRecoilTransaction_UNSTABLE(
    ({ get, reset, set }) =>
      (
        id: string,
        index: number,
        groupId?: string,
        groupByFieldValue?: string
      ) => {
        set(groupAtoms.groupId, groupId || null);
        set(currentModalSample, { id, index });
        reset(groupAtoms.nestedGroupIndex);
        reset(dynamicGroupCurrentElementIndex);
        groupByFieldValue &&
          set(groupAtoms.groupByFieldValue, groupByFieldValue);

        let fallback = get(groupAtoms.groupSlice(false));
        if (map[fallback] === "point_cloud") {
          fallback = types
            .filter(({ mediaType }) => mediaType !== "point_cloud")
            .map(({ name }) => name)
            .sort()[0];
        }
        set(groupAtoms.groupSlice(true), fallback);
      },
    [map, types]
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
