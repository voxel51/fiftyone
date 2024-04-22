import { selectorFamily } from "recoil";
import { aggregationQuery } from "../aggregations";
import { dynamicGroupViewQuery } from "../dynamicGroups";

export const dynamicGroupsElementCount = selectorFamily<number, string | null>({
  key: "dynamicGroupsElementCount",
  get:
    (groupByFieldValueExplicit: string | null = null) =>
    ({ get }) => {
      if (groupByFieldValueExplicit === null) {
        throw new Error("E");
      }
      return (
        get(
          aggregationQuery({
            customView: get(dynamicGroupViewQuery(groupByFieldValueExplicit)),
            extended: false,
            modal: false,
            paths: [""],
          })
        ).at(0)?.count ?? 0
      );
    },
});
