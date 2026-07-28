import type { SerializableParam } from "recoil";
import { selectorFamily } from "recoil";
import { aggregationQuery } from "../aggregations";
import { groupByFieldValue, isDynamicGroup } from "../dynamicGroups";

export const dynamicGroupsElementCount = selectorFamily({
  key: "dynamicGroupsElementCount",
  get:
    ({
      value = null,
      modal = false,
    }: {
      value?: SerializableParam;
      modal: boolean;
    }) =>
    ({ get }) => {
      const dynamicGroup = value === null ? get(groupByFieldValue) : value;

      // groupByFieldValue settles to null while the modal's group state
      // initializes; suspend instead of counting against a null group, which
      // returns a bogus result that clobbers the last good count
      if (dynamicGroup === null && get(isDynamicGroup)) {
        return new Promise<number>(() => {});
      }

      return (
        get(
          aggregationQuery({
            dynamicGroup,
            extended: false,
            modal,
            paths: [""],
            useSelection: false,
          }),
        )?.at(0)?.count ?? 0
      );
    },
});
