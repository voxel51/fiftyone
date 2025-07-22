import type { SerializableParam } from "recoil";
import { selectorFamily } from "recoil";
import { aggregationQuery } from "../aggregations";
import { groupByFieldValue, isNestedDynamicGroup } from "../dynamicGroups";

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
      return (
        get(
          aggregationQuery({
            dynamicGroup: value === null ? get(groupByFieldValue) : value,
            extended: false,
            modal,
            paths: [""],
            useSelection: false,
            mixed: get(isNestedDynamicGroup) ? true : false,
          })
        ).at(0)?.count ?? 0
      );
    },
});
