import * as fos from "@fiftyone/state";
import { isMatchingAtom, stringExcludeAtom } from "@fiftyone/state";
import { getFetchFunction, isObjectIdString } from "@fiftyone/utilities";
import { atomFamily, selectorFamily } from "recoil";
import { labelTagsCount } from "../../Sidebar/Entries/EntryCounts";
import { nullSort } from "../utils";
import type { Result } from "./Result";

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

export const pathSearchCount = selectorFamily({
  key: "pathSearchCount",
  get:
    ({ modal, path, value }: { modal: boolean; path: string; value: string }) =>
    ({ get }) => {
      return (
        get(
          stringSearchResults({
            modal,
            path,
            filter: { path, value },
          })
        )?.values?.[0]?.count || 0
      );
    },
});

export const stringSearchResults = selectorFamily<
  {
    values?: Result[];
    count?: number;
  },
  { path: string; modal: boolean; filter?: { path: string; value: string } }
>({
  key: "stringSearchResults",
  get:
    ({ path, modal, filter }) =>
    async ({ get }) => {
      const search = filter ? "" : get(stringSearch({ modal, path }));
      // for object id searches, skip request when the string is not <= 24 hex
      if (get(fos.isObjectIdField(path)) && !isObjectIdString(search, false)) {
        return { values: [] };
      }

      const sorting = get(fos.sortFilterResults(modal));
      const mixed = get(fos.groupStatistics(modal)) === "group";
      const selected = get(fos.stringSelectedValuesAtom({ path, modal }));

      const isLabelTag = path.startsWith("_label_tags");
      let data: { values: Result[]; count: number | null } = {
        values: [],
        count: 0,
      };

      if (!modal && get(fos.queryPerformance)) {
        const filters = Object.fromEntries(
          Object.entries(get(fos.filters) || {}).filter(([p]) => p !== path)
        );

        return {
          values: get(
            fos.lightningStringResults({
              path,
              search,
              exclude: [...selected.filter((s) => s !== null)] as string[],
              filters,
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
          selected: filter ? [] : selected,
          filters: filter
            ? {
                [filter.path]: {
                  exclude: get(stringExcludeAtom({ path, modal })),
                  isMatching: get(isMatchingAtom({ path, modal })),
                  values: [filter.value],
                },
              }
            : get(pathSearchFilters({ modal, path })),
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
