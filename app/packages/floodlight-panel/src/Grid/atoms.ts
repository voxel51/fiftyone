import * as fos from "@fiftyone/state";
import { atom, selector, selectorFamily } from "@fiftyone/reverb";

// The panel's display settings are the App's, so the header drives them
export {
  defaultGridZoom,
  gridCrop,
  gridSpacing,
  gridZoom,
  recommendedGridZoom,
  storedGridZoom,
} from "@fiftyone/core/src/components/Grid/atoms";
export const gridAutosizing = fos.gridAutosizing;
export const maxGridItemsSizeBytes = fos.maxGridItemsSizeBytes;

const sortFieldsMap = selector({
  key: "floodlight.sortFieldsMap",
  get: ({ get }) => {
    const f = Object.keys(get(fos.filters) ?? {});
    const valid = get(fos.validIndexes(f));

    const map = {};
    for (const { name, key: dbField } of [
      ...valid.available,
      ...valid.trailing,
    ]) {
      const field = get(fos.fieldPath(dbField));
      if (!map[field]) {
        map[field] = [];
      }

      map[field].push(name);
    }

    return map;
  },
});

const gridIndex = selector({
  key: "floodlight.gridIndex",
  get: ({ get }) => {
    if (!get(fos.queryPerformance)) {
      return undefined;
    }

    const field = get(fos.gridSortBy)?.field;
    if (!field) return get(fos.activeIndex);

    const map = get(sortFieldsMap);
    if (!map[field]) return get(fos.activeIndex);
    return map[field][0];
  },
});

export const gridPage = atom({
  key: "floodlight.gridPage",
  default: 0,
});

export const gridAt = atom<string | null>({
  key: "floodlight.gridAt",
  default: null,
});

export const gridFraction = atom({
  key: "floodlight.gridFraction",
  default: 0,
  effects: [],
});

export const pageParameters = selector({
  key: "floodlight.paginateGridVariables",
  get: ({ get }) => {
    const dataset = get(fos.datasetName);

    if (!dataset) {
      throw new Error("dataset is not defined");
    }

    const slice = get(fos.groupSlice);
    const queryPerformance = get(fos.queryPerformance);

    const extendedStages = queryPerformance
      ? get(fos.extendedStagesNoSort)
      : get(fos.extendedStages);

    const sort = get(fos.gridSortBy);

    const extra =
      queryPerformance &&
      !extendedStages["fiftyone.core.stages.SortBySimilarity"]
        ? {
            sortBy: sort?.field,
            desc: sort?.descending,
            hint: get(gridIndex),
          }
        : {};

    const params = {
      dataset,
      view: get(fos.view),
      filters: get(fos.filters),
      filter: {
        group: slice
          ? {
              slice,
              slices: [slice],
            }
          : null,
      },
      extendedStages,
      maxQueryTime: queryPerformance ? get(fos.config).maxQueryTime : null,
      ...extra,
    };

    return (page: number, pageSize: number) => ({
      ...params,
      after: page ? String(page * pageSize - 1) : null,
      first: pageSize,
    });
  },
});

/**
 * Per-group "siblings" pager used by the swimlane row next to each
 * grid sample. Returns the other slices of the same group; the cover
 * (default-slice sample from the main grid query) renders separately.
 *
 * The lane is keyed by `groupId` so each row in the swimlane view has
 * its own pager. The view itself is left untouched — same `view`,
 * `filters`, `extendedStages` as the main grid — but `filter.group`
 * is set to match this one group's id across all dataset slices, so
 * the server returns the group's per-slice samples.
 */
export const groupSiblingsPageParameters = selectorFamily<
  (page: number, pageSize: number) => Record<string, unknown>,
  string
>({
  key: "floodlight.groupSiblingsPageParameters",
  get:
    (groupId) =>
    ({ get }) => {
      const dataset = get(fos.datasetName);
      if (!dataset) throw new Error("dataset is not defined");

      const queryPerformance = get(fos.queryPerformance);
      const extendedStages = queryPerformance
        ? get(fos.extendedStagesNoSort)
        : get(fos.extendedStages);

      const params = {
        dataset,
        view: get(fos.view),
        filters: get(fos.filters),
        filter: {
          // Selecting by group id flattens the collection to a
          // single group's per-slice samples (no slice constraint).
          // The row's renderer is responsible for hiding the
          // default-slice entry so it doesn't visually duplicate
          // the cover.
          group: { id: groupId, slices: null, slice: null },
        },
        extendedStages,
        maxQueryTime: queryPerformance ? get(fos.config).maxQueryTime : null,
      };

      return (page: number, pageSize: number) => ({
        ...params,
        after: page ? String(page * pageSize - 1) : null,
        first: pageSize,
      });
    },
});

export const showGridPixels = atom({ key: "showGridPixels", default: false });

export const gridSquareTiles = atom<boolean>({
  key: "floodlight.gridSquareTiles",
  default: false,
  effects: [
    fos.getBrowserStorageEffectForKey("floodlight.gridSquareTiles", {
      valueClass: "boolean",
    }),
  ],
});
