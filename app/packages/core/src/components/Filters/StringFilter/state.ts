import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { atomFamily, selectorFamily } from "recoil";
import { labelTagsCount } from "../../Sidebar/Entries/EntryCounts";
import { nullSort } from "../utils";
import { Result } from "./Result";

export const stringSearch = atomFamily<
  string,
  { path: string; modal: boolean }
>({
  key: "stringSearchResults",
  default: "",
});

const pathSearchFilters = selectorFamily({
  key: "pathSearchFilters",
  get:
    ({ modal, path }: { modal: boolean; path: string }) =>
    ({ get }) => {
      const filters = { ...get(modal ? fos.modalFilters : fos.filters) };

      // omit the path being searched, but include coinciding filters
      delete filters[path];

      return filters;
    },
});

export const stringSearchResults = selectorFamily<
  {
    values?: Result[];
    count?: number;
  },
  { path: string; modal: boolean }
>({
  key: "stringSearchResults",
  get:
    ({ path, modal }) =>
    async ({ get }) => {
      const search = get(stringSearch({ modal, path }));
      const sorting = get(fos.sortFilterResults(modal));
      const mixed = get(fos.groupStatistics(modal)) === "group";
      const selected = get(fos.stringSelectedValuesAtom({ path, modal }));

      const isLabelTag = path.startsWith("_label_tags");
      let data: { values: Result[]; count: number | null } = {
        values: [],
        count: 0,
      };

      if (!modal && get(fos.isLightningPath(path))) {
        return {
          values: get(
            fos.lightningStringResults({
              path,
              search,
              exclude: [...selected.filter((s) => s !== null)] as string[],
            })
          )?.map((value) => ({ value, count: null })),
        };
      }

      const noneCount = get(fos.noneCount({ path, modal, extended: false }));

      if (isLabelTag) {
        const labels = get(labelTagsCount({ modal, extended: false }));
        data = {
          count: labels.count,
          values: labels.results,
        };
      } else {
        data = await getFetchFunction()("POST", "/values", {
          dataset: get(fos.datasetName),
          view: get(fos.view),
          path,
          search,
          selected,
          filters: get(pathSearchFilters({ modal, path })),
          group_id: modal ? get(fos.groupId) || null : null,
          mixed,
          slice: get(fos.groupSlice),
          slices: mixed ? null : get(fos.currentSlices(modal)), // when mixed, slice is not needed
          sample_id:
            modal && !get(fos.groupId) && !mixed
              ? get(fos.modalSampleId)
              : null,
          ...sorting,
        });
      }

      let { values, count } = data;
      count ??= 0;
      if (noneCount > 0 && "None".includes(search)) {
        values = [...values, { value: null, count: noneCount }]
          .sort(nullSort(sorting))
          .slice(0, 25);
        count++;
      }

      return { count, values };
    },
});
