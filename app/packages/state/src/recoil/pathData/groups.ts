import { selectorFamily } from "recoil";
import { aggregationQuery } from "../aggregations";

export const dynamicGroupsElementCount = selectorFamily<number, string | null>({
  key: "dynamicGroupsElementCount",
  get:
    (dynamicGroup: unknown) =>
    ({ get }) => {
      return (
        get(
          aggregationQuery({
            dynamicGroup,
            extended: false,
            modal: false,
            paths: [""],
          })
        ).at(0)?.count ?? 0
      );
    },
});
