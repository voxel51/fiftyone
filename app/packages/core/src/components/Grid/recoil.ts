import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { DefaultValue, atom, atomFamily, selector } from "recoil";
import { MANAGING_GRID_MEMORY } from "../../utils/links";

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

const gridAutosizingStore = atomFamily<boolean, string>({
  key: "gridAutosizingStore",
  default: true,
  effects: (datasetId) => [
    fos.getBrowserStorageEffectForKey(`gridAutosizing-${datasetId}`, {
      valueClass: "boolean",
    }),
  ],
});

export const gridAutosizing = selector({
  key: "gridAutosizing",
  get: ({ get }) => get(gridAutosizingStore(get(fos.datasetId) ?? "")),
  set: ({ get, set }, value) =>
    set(gridAutosizingStore(get(fos.datasetId) ?? ""), value),
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
      get(gridAutosizing) &&
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
      set(gridAutosizing, false);
      reset(recommendedGridZoom);
    }

    set(gridZoomStore(get(fos.datasetId) ?? ""), result);
  },
});

export const gridCropCallback = selector({
  key: "gridCropCallback",
  get: ({ getCallback }) => {
    return getCallback(({ snapshot }) => async () => {
      return (
        (await snapshot.getPromise(fos.isPatchesView)) &&
        (await snapshot.getPromise(fos.cropToContent(false)))
      );
    });
  },
});

export const gridCrop = selector({
  key: "gridCrop",
  get: ({ get }) => {
    return get(fos.isPatchesView) && get(fos.cropToContent(false));
  },
});

// ensure navigator is defined
const deviceMemory =
  // @ts-ignore
  typeof navigator !== "undefined" ? navigator?.deviceMemory || 8 : 8;

export const maxGridItemsSizeBytes = atom({
  key: "maxGridItemsSizeBytes",
  default: (deviceMemory / 8) * 1e9,
  effects: [
    fos.getBrowserStorageEffectForKey("maxGridItemsSizeBytes", {
      valueClass: "number",
    }),
  ],
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

export const recommendedGridZoom = atom<number | null>({
  key: "recommendedGridZoom",
  default: null,
  effects: [
    subscribe(
      ({ event }, { reset }, prev) =>
        event !== "modal" &&
        prev?.event !== "modal" &&
        reset(recommendedGridZoom)
    ),
  ],
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
