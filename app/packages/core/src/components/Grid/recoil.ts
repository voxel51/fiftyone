import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import {
  DefaultValue,
  atom,
  atomFamily,
  selector,
  selectorFamily,
} from "recoil";
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

    // Grid scrubber: when the user has committed a scrub value, page 0's
    // `after` is the sort-field value itself (encoded as a string) and we
    // flip `cursorPagination` on so the server seeks via
    // `match({sort_by: {$gt|$lt: value}})` instead of skipping `page * pageSize`.
    //
    // Only page 0 carries the value — subsequent pages within the scrubbed
    // viewport still use the index-based `after`, which is correct here
    // because the server's cursor-mode seek shifts the entire collection
    // origin to the matched row.
    const scrubCursor = sort
      ? get(fos.gridScrubCursor(get(fos.datasetId) ?? ""))
      : null;

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
      ...(scrubCursor !== null ? { cursorPagination: true } : {}),
    };

    return (page: number, pageSize: number) => {
      // Page 0 + active scrub cursor → seek to the sort-field value.
      // Subsequent pages stream forward from the seek using the existing
      // index encoding.
      const after =
        page === 0 && scrubCursor !== null
          ? scrubCursor
          : page
          ? String(page * pageSize - 1)
          : null;
      return {
        ...params,
        after,
        first: pageSize,
      };
    };
  },
});

/**
 * Per-slice variant of {@link pageParameters} for the swimlanes view.
 * Each lane fetches a single slice's samples, so the slice in
 * `filter.group` is taken from the lane's identity (the family key)
 * rather than the global `groupSlice` atom. All other parameters
 * (view, filters, sort, cursor, extended stages) follow the global
 * grid state — every lane shares the same view-level state, just
 * scoped to its own slice.
 *
 * Note that the scrubber's `gridScrubCursor` and `cursorPagination`
 * are intentionally NOT included here. Cursor-mode pagination is
 * per-collection; combining it with per-slice filtering would
 * require the server to seek inside each lane independently, which
 * the current `paginate_samples` doesn't support and isn't part of
 * the swimlanes V1.
 */
export const swimlanePageParameters = selectorFamily<
  (page: number, pageSize: number) => Record<string, unknown>,
  string
>({
  key: "swimlanePageParameters",
  get:
    (slice) =>
    ({ get }) => {
      const dataset = get(fos.datasetName);
      if (!dataset) throw new Error("dataset is not defined");

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
          group: { slice, slices: [slice] },
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
