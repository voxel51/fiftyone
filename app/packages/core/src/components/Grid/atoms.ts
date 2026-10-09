import * as fos from "@fiftyone/state";
import { DefaultValue, atom, atomFamily, selector } from "@fiftyone/reverb";
import { MANAGING_GRID_MEMORY } from "@fiftyone/utilities";

/**
 * Convert a [0, 10] zoom setting to [-15, -1]
 *
 * @param {number} defaultRange [0, 10] range
 * @returns {number} [-15, -1]
 */
const convertDefault = (defaultRange) => {
  return -(14 - (defaultRange / 10) * 14 + 1);
};

const sortFieldsMap = selector({
  key: "sortFieldsMap",
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
  key: "gridIndex",
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

export const defaultGridZoom = selector<number>({
  key: "defaultGridZoom",
  get: ({ get }) => get(fos.config)?.gridZoom,
});

export const gridPage = atom({
  key: "gridPage",
  default: 0,
});

export const gridAt = atom<string | null>({
  key: "gridAt",
  default: null,
});

export const gridOffset = atom({
  key: "gridOffset",
  default: 0,
  effects: [],
});

export const gridSpacing = atom({
  key: "gridSpacing",
  default: 3,
  effects: [
    fos.getBrowserStorageEffectForKey("gridSpacing", { valueClass: "number" }),
  ],
});

const gridZoomStore = atomFamily<number | null, string>({
  key: "gridZoomStore",
  default: null,
  effects: (datasetId) => [
    fos.getBrowserStorageEffectForKey(`gridZoomStore-${datasetId}`, {
      valueClass: "number",
    }),
  ],
});

export const gridZoom = selector<number>({
  key: "gridZoom",
  get: ({ get }) => {
    const recommended = get(recommendedGridZoom);
    const setting =
      get(gridZoomStore(get(fos.datasetId) ?? "")) ??
      convertDefault(get(defaultGridZoom));
    if (
      get(fos.gridAutosizing) &&
      typeof recommended === "number" &&
      recommended > setting
    ) {
      return recommended;
    }

    return setting;
  },
  set: ({ get, reset, set }, value) => {
    const result =
      value instanceof DefaultValue
        ? convertDefault(get(defaultGridZoom))
        : value;

    const recommended = get(recommendedGridZoom);
    if (typeof recommended === "number" && result < recommended) {
      set(fos.snackbarLink, {
        link: MANAGING_GRID_MEMORY,
        message: "Grid autosizing disabled",
      });
      set(fos.gridAutosizing, false);
      reset(recommendedGridZoom);
    }

    set(gridZoomStore(get(fos.datasetId) ?? ""), result);
  },
});

export const gridCrop = selector({
  key: "gridCrop",
  get: ({ get }) => {
    return get(fos.isPatchesView) && get(fos.cropToContent(false));
  },
});

export const pageParameters = selector({
  key: "paginateGridVariables",
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

    const extra =
      queryPerformance &&
      !extendedStages["fiftyone.core.stages.SortBySimilarity"]
        ? {
            sortBy: get(fos.gridSortBy)?.field,
            desc: get(fos.gridSortBy)?.descending,
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

    return (page: number, pageSize: number) => {
      return {
        ...params,
        after: page ? String(page * pageSize - 1) : null,
        first: pageSize,
      };
    };
  },
});

// keyed by what sets a tile's bytes: the dataset's media in the grid's media
// field and group slice. Views and filters choose among the same media, so a
// recommendation outlives them and later visits start at it
const recommendedGridZoomStore = atomFamily<number | null, string>({
  key: "recommendedGridZoomStore",
  default: null,
  effects: (key) => [
    fos.getBrowserStorageEffectForKey(`recommendedGridZoom-${key}`, {
      valueClass: "number",
    }),
  ],
});

const recommendedGridZoomKey = selector<string>({
  key: "recommendedGridZoomKey",
  get: ({ get }) =>
    [
      get(fos.datasetId) ?? "",
      get(fos.groupSlice) ?? "",
      get(fos.selectedMediaField(false)),
    ].join(":"),
});

/** The zoom auto-sizing last needed for the dataset's media. */
export const recommendedGridZoom = selector<number | null>({
  key: "recommendedGridZoom",
  get: ({ get }) => get(recommendedGridZoomStore(get(recommendedGridZoomKey))),
  set: ({ get, reset, set }, value) => {
    const store = recommendedGridZoomStore(get(recommendedGridZoomKey));
    value instanceof DefaultValue ? reset(store) : set(store, value);
  },
});

export const showGridPixels = atom({ key: "showGridPixels", default: false });

export const storedGridZoom = atom<number | null>({
  key: "storedGridZoom",
  default: null,
  effects: [
    fos.getBrowserStorageEffectForKey("storedGridZoom", {
      valueClass: "number",
    }),
  ],
});
