import {
  groupStatistics,
  lightningStringResults,
  sortFilterResults,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import { atomFamily, selectorFamily } from "recoil";

export type Value = {
  value: string | null;
  count: number | null;
};

export const categoricalSearch = atomFamily<
  string,
  { path: string; modal: boolean }
>({
  key: "categoricalSearchResults",
  default: "",
});

export const categoricalSearchResults = selectorFamily<
  {
    values: Value[];
    count?: number;
  },
  { path: string; modal: boolean }
>({
  key: "categoricalSearchResults",
  get:
    ({ path, modal }) =>
    async ({ get }) => {
      const search = get(categoricalSearch({ modal, path }));
      const sorting = get(sortFilterResults(modal));
      const mixed = get(groupStatistics(modal)) === "group";
      const selected = get(stringSelectedValuesAtom({ path, modal }));

      const isLabelTag = path.startsWith("_label_tags");
      let data = { values: [] as V[], count: 0 };

      return {
        values: get(
          lightningStringResults({
            path,
            search,
            exclude: selected.filter((s) => s !== null),
          })
        ).map(([value]) => ({ value, count: null })),
      };

      const noneCount = get(fos.noneCount({ path, modal, extended: false }));

      if (isLabelTag) {
        const labels = get(labelTagsCount({ modal, extended: false }));
        data = {
          count: labels.count,
          values: labels.results.map(([value, count]) => ({ value, count })),
        };
      } else {
        data = await getFetchFunction()("POST", "/values", {
          dataset: get(fos.datasetName),
          view: get(fos.view),
          path,
          search,
          selected,
          group_id: modal ? get(groupId) || null : null,
          mixed,
          slice: get(fos.groupSlice),
          slices: mixed ? null : get(fos.currentSlices(modal)), // when mixed, slice is not needed
          sample_id:
            modal && !get(groupId) && !mixed ? get(fos.modalSampleId) : null,
          ...sorting,
        });
      }

      let { values, count } = data;
      if (noneCount > 0 && "None".includes(search)) {
        values = [...values, { value: null, count: noneCount }]
          .sort(nullSort(sorting))
          .slice(0, 25);
        count++;
      }

      return { count, values };
    },
});
