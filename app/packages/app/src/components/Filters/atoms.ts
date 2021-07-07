import { atom, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { request } from "../../utils/socket";
import { viewsAreEqual } from "../../utils/view";

export { filterStages } from "../../recoil/selectors";

export type FilterParams = {
  modal: boolean;
  path: string;
};

export const modalFilterStages = atom<object>({
  key: "modalFilterStages",
  default: {},
});

export const hasFilters = selector<boolean>({
  key: "hasFilters",
  get: ({ get }) => Object.keys(get(selectors.filterStages)).length > 0,
});

export const matchedTags = selectorFamily<
  Set<string>,
  { key: string; modal: boolean }
>({
  key: "matchedTags",
  get: ({ key, modal }) => ({ get }) => {
    const tags = get(modal ? modalFilterStages : selectors.filterStages).tags;
    if (tags && tags[key]) {
      return new Set(tags[key]);
    }
    return new Set();
  },
  set: ({ key, modal }) => ({ get, set }, value) => {
    const stages = {
      ...get(modal ? modalFilterStages : selectors.filterStages),
    };
    const tags = { ...(stages.tags || {}) };
    if (value instanceof Set && value.size) {
      tags[key] = Array.from(value);
    } else if (stages.tags && key in stages.tags) {
      delete tags[key];
    }
    stages.tags = tags;
    if (Object.keys(stages.tags).length === 0) {
      delete stages["tags"];
    }
    set(modal ? modalFilterStages : selectors.filterStages, stages);
  },
});

export const filterStage = selectorFamily<object, FilterParams>({
  key: "filterStage",
  get: ({ path, modal }) => ({ get }) => {
    return (
      get(modal ? modalFilterStages : selectors.filterStages)?.[path] ?? {}
    );
  },
  set: ({ path, modal }) => ({ get, set }, filter) => {
    const filters = Object.assign(
      {},
      get(modal ? modalFilterStages : selectors.filterStages)
    );
    if (filter === null) {
      delete filters[path];
    } else {
      filters[path] = filter;
    }
    set(modal ? modalFilterStages : selectors.filterStages, filters);
  },
});

export const modalStats = selector({
  key: "modalStats",
  get: async ({ get }) => {
    const id = uuid();
    const data = await request({
      type: "frame_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sampleId,
      },
    });

    return data.stats;
  },
});

export const extendedModalStats = selector({
  key: "modalExtendedStats",
  get: async ({ get }) => {
    const id = uuid();
    const data = await request({
      type: "frame_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sampleId,
        filters: get(modalFilterStages),
      },
    });

    return data.stats;
  },
});

export const noneFieldCounts = selector<{ [key: string]: number }>({
  key: "noneFieldCounts",
  get: ({ get }) => {
    const raw = get(atoms.datasetStatsRaw);
    const currentView = get(selectors.view);
    if (!raw.view) {
      return {};
    }
    if (viewsAreEqual(raw.view, currentView)) {
      return raw.stats.none.reduce((acc, cur) => {
        acc[cur.name] = cur.result;
        return acc;
      }, {});
    }
    return {};
  },
});

export const noneFilteredFieldCounts = selector<{ [key: string]: number }>({
  key: "noneFilteredFieldCounts",
  get: ({ get }) => {
    const raw = get(atoms.extendedDatasetStatsRaw);
    const currentView = get(selectors.view);
    if (!raw.view) {
      return {};
    }
    if (!viewsAreEqual(raw.view, currentView)) {
      return {};
    }
    const currentFilters = get(selectors.filterStages);
    if (!selectors.filtersAreEqual(raw.filters, currentFilters)) {
      return {};
    }

    if (Object.entries(currentFilters).length === 0) {
      return get(noneFieldCounts);
    }

    return raw.stats.none.reduce((acc, cur) => {
      acc[cur.name] = cur.result;
      return acc;
    }, {});
  },
});

export const labelTagCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "labelTagCounts",
  get: (modal) => ({ get }) => {
    const stats = get(selectors.datasetStats);
    const paths = get(selectors.labelTagsPaths);

    const result = {};

    stats &&
      stats.forEach((s) => {
        if (paths.includes(s.name)) {
          Object.entries(s.result).forEach(([k, v]) => {
            if (!(k in result)) {
              result[k] = v;
            } else {
              result[k] += v;
            }
          });
        }
      });

    return result;
  },
});

export const filteredLabelTagCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "filteredLabelTagCounts",
  get: (modal) => ({ get }) => {
    const stats = get(selectors.extendedDatasetStats);
    const paths = get(selectors.labelTagsPaths);

    const result = {};

    stats &&
      stats.forEach((s) => {
        if (paths.includes(s.name)) {
          Object.entries(s.result).forEach(([k, v]) => {
            if (!(k in result)) {
              result[k] = v;
            } else {
              result[k] += v;
            }
          });
        }
      });
    return result;
  },
});

export const sampleTagCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "sampleTagCounts",
  get: (modal) => ({ get }) => {
    const stats = get(selectors.datasetStats);

    return stats
      ? stats.reduce((acc, cur) => {
          if (cur.name === "tags") {
            return cur.result;
          }
          return acc;
        }, {})
      : {};
  },
});

export const filteredSampleTagCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "filteredSampleTagCounts",
  get: (modal) => ({ get }) => {
    const stats = get(selectors.extendedDatasetStats);

    return stats
      ? stats.reduce((acc, cur) => {
          if (cur.name === "tags") {
            return cur.result;
          }
          return acc;
        }, {})
      : {};
  },
});

export const labelCounts = selectorFamily<
  { [key: string]: number },
  { key: "frame" | "sample"; modal: boolean }
>({
  key: "labelCounts",
  get: ({ key, modal }) => ({ get }) => {
    const stats = get(modal ? modalStats : selectors.datasetStats);

    return {};
  },
});

export const filteredLabelCounts = selectorFamily<
  { [key: string]: number },
  { key: "frame" | "sample"; modal: boolean }
>({
  key: "filteredLabelCounts",
  get: ({ key, modal }) => ({ get }) => {
    return {};
  },
});

export const scalarCounts = selectorFamily<
  { [key: string]: number | string | null },
  boolean
>({
  key: "scalarCounts",
  get: (modal) => ({ get }) => {
    return {};
  },
});

export const filteredScalarCounts = selectorFamily<
  { [key: string]: number | string | null },
  boolean
>({
  key: "filteredScalarCounts",
  get: (modal) => ({ get }) => {
    return {};
  },
});
