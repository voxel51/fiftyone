import { selector } from "recoil";
import { aggregationQuery } from "../aggregations";
import { dynamicGroupViewQuery } from "../view";

export const dynamicGroupsElementCount = selector<number>({
  key: "dynamicGroupsElementCount",
  get: ({ get }) =>
    get(
      aggregationQuery({
        customView: get(dynamicGroupViewQuery),
        extended: false,
        modal: false,
        paths: [""],
      })
    ).at(0)?.count ?? 0,
});
