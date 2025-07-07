import { selectorFamily } from "recoil";
import { aggregationQuery } from "../aggregations";
import { groupByFieldValue } from "../dynamicGroups";

export const dynamicGroupsElementCount = selectorFamily({
  key: "dynamicGroupsElementCount",
  get:
    (value = null) =>
    ({ get }) => {
      return (
        get(
          aggregationQuery({
            dynamicGroup: value === null ? get(groupByFieldValue) : value,
            extended: false,
            modal: false,
            paths: [""],
          })
        ).at(0)?.count ?? 0
      );
    },
});
