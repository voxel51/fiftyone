import type { SerializableParam } from "recoil";
import { selectorFamily } from "recoil";
import { aggregationQuery } from "../aggregations";
import { groupByFieldValue } from "../dynamicGroups";
import { modalSample } from "../modal";

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
      // in the modal, the group size rides on the poster's `_group_count`; absent
      // it, 0 puts the imavid timeline in streaming mode (the stream reveals length)
      if (modal) {
        const sample = get(modalSample)?.sample as
          | { _group_count?: number }
          | undefined;
        return typeof sample?._group_count === "number"
          ? sample._group_count
          : 0;
      }

      // grid context only (page-load / view-change sidebar) may aggregate
      return (
        get(
          aggregationQuery({
            dynamicGroup: value === null ? get(groupByFieldValue) : value,
            extended: false,
            modal,
            paths: [""],
            useSelection: false,
          })
        )?.at(0)?.count ?? 0
      );
    },
});
