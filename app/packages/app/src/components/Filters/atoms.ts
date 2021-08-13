import { atom, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { AGGS } from "../../utils/labels";
import { request } from "../../utils/socket";
import { viewsAreEqual } from "../../utils/view";
import { Value } from "./types";
import { activeLabels } from "./utils";

export { filterStages } from "../../recoil/selectors";

export type FilterParams = {
  modal: boolean;
  path: string;
};

export const modalFilterStages = atom<object>({
  key: "modalFilterStages",
  default: {},
});

export const hasFilters = selectorFamily<boolean, boolean>({
  key: "hasFilters",
  get: (modal) => ({ get }) =>
    Object.keys(get(modal ? modalFilterStages : selectors.filterStages))
      .length > 0,
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

const modalStatsRaw = selector({
  key: "modalStatsRaw",
  get: async ({ get }) => {
    const id = uuid();
    const data = await request({
      type: "modal_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sample._id,
      },
    });

    return data.stats;
  },
});

export const modalStats = selector({
  key: "modalStats",
  get: ({ get }) => get(modalStatsRaw),
});

const extendedModalStatsRaw = selector({
  key: "modalExtendedStatsRaw",
  get: async ({ get }) => {
    const id = uuid();
    const data = await request({
      type: "modal_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sample._id,
        filters: get(modalFilterStages),
      },
    });

    return data.stats;
  },
});

export const extendedModalStats = selector({
  key: "extendedModalStats",
  get: ({ get }) => get(extendedModalStatsRaw),
});

const computeNoneCounts = (stats: Array<any>): { [key: string]: number } => {
  let count = null;

  const data = stats.reduce((acc, cur) => {
    if (cur.name === null) {
      count = cur.result;
    }

    if (!acc[cur.name]) {
      acc[cur.name] = {};
    }

    acc[cur.name][cur._CLS] = cur.result;

    return acc;
  }, {});

  const result = {};
  for (const path in data) {
    const parent = path.includes(".")
      ? path.split(".").slice(0, -1).join(".")
      : path;

    if (path === parent) {
      result[path] = count - data[path][COUNT_CLS];
    } else if (parent.includes(".")) {
      result[path] = data[parent][COUNT_CLS] - data[path][COUNT_CLS];
    }
  }

  return result;
};

export const noneFieldCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "noneFieldCounts",
  get: (modal) => ({ get }) => {
    const raw = get(modal ? modalStatsRaw : atoms.datasetStatsRaw);

    const currentView = get(selectors.view);
    if (!raw.view) {
      return {};
    }
    if (!viewsAreEqual(raw.view, currentView)) {
      return {};
    }

    return computeNoneCounts(raw.stats);
  },
});

export const noneFilteredFieldCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "noneFilteredFieldCounts",
  get: (modal) => ({ get }) => {
    const raw = get(
      modal ? extendedModalStatsRaw : atoms.extendedDatasetStatsRaw
    );

    const currentView = get(selectors.view);
    if (!raw.view) {
      return {};
    }
    if (!viewsAreEqual(raw.view, currentView)) {
      return {};
    }

    const currentFilters = get(
      modal ? modalFilterStages : selectors.filterStages
    );
    if (!selectors.filtersAreEqual(raw.filters, currentFilters)) {
      return {};
    }

    if (Object.entries(currentFilters).length === 0) {
      return noneFieldCounts(modal);
    }

    return computeNoneCounts(raw.stats);
  },
});

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean }
>({
  key: "noneCount",
  get: ({ path, modal }) => ({ get }) => {
    return get(noneFieldCounts(modal))[path];
  },
});

export const labelTagCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "labelTagCounts",
  get: (modal) => ({ get }) => {
    const stats = get(modal ? modalStats : selectors.datasetStats);
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
    const stats = get(
      modal ? extendedModalStats : selectors.extendedDatasetStats
    );
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
    const stats = get(modal ? modalStats : selectors.datasetStats);

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
    const stats = get(
      modal ? extendedModalStats : selectors.extendedDatasetStats
    );

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

const COUNT_CLS = "Count";

export const catchLabelCount = (
  names: string[],
  prefix: string,
  cur: { name: string; _CLS: string; result: number },
  acc: { [key: string]: number }
): void => {
  if (
    cur.name &&
    names.includes(cur.name.slice(prefix.length).split(".")[0]) &&
    cur._CLS === COUNT_CLS
  ) {
    acc[prefix + cur.name.slice(prefix.length).split(".")[0]] = cur.result;
  }
};

export const labelCounts = selectorFamily<
  { [key: string]: number },
  { key: "frame" | "sample"; modal: boolean }
>({
  key: "labelCounts",
  get: ({ key, modal }) => ({ get }) => {
    const names = get(selectors.labelNames(key));
    const prefix = key === "sample" ? "" : "frames.";
    const stats = get(modal ? modalStats : selectors.datasetStats);
    if (stats === null) {
      return null;
    }

    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc);
      return acc;
    }, {});
  },
});

export const filteredLabelCounts = selectorFamily<
  { [key: string]: number },
  { key: "frame" | "sample"; modal: boolean }
>({
  key: "filteredLabelCounts",
  get: ({ key, modal }) => ({ get }) => {
    const names = get(selectors.labelNames(key));
    const prefix = key === "sample" ? "" : "frames.";
    const stats = get(
      modal ? extendedModalStats : selectors.extendedDatasetStats
    );
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc);
      return acc;
    }, {});
  },
});

export const scalarCounts = selectorFamily<
  { [key: string]: number | string | null },
  boolean
>({
  key: "scalarCounts",
  get: (modal) => ({ get }) => {
    if (modal) {
      return get(atoms.modal).sample;
    }

    const names = get(selectors.primitiveNames("sample"));
    const stats = get(selectors.datasetStats);
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, "", cur, acc);
      return acc;
    }, {});
  },
});

export const filteredScalarCounts = selectorFamily<
  { [key: string]: number | string | null } | null,
  boolean
>({
  key: "filteredScalarCounts",
  get: (modal) => ({ get }) => {
    if (modal) {
      return null;
    }

    const names = get(selectors.primitiveNames("sample"));
    const stats = get(selectors.extendedDatasetStats);
    if (stats === null) {
      return null;
    }

    console.log(stats);
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, "", cur, acc);
      return acc;
    }, {});
  },
});

export const countsAtom = selectorFamily<
  { count: number; results: [Value, number][] },
  { path: string; modal: boolean; filtered: boolean }
>({
  key: "categoricalFieldCounts",
  get: ({ filtered, path, modal }) => ({ get }) => {
    const none = get(
      filtered ? noneFilteredFieldCounts(modal) : noneFieldCounts(modal)
    )[path];

    const atom = modal
      ? filtered
        ? extendedModalStats
        : modalStats
      : filtered
      ? selectors.extendedDatasetStats
      : selectors.datasetStats;

    const value = get(atom);
    if (!value && filtered) {
      return null;
    }

    const data = (value ?? []).reduce(
      (acc, cur) => {
        if (cur.name === path && cur._CLS === AGGS.COUNT_VALUES) {
          return {
            count: cur.result[0],
            results: cur.result[1],
          };
        }
        return acc;
      },
      { count: 0, results: [] }
    );

    if (none && none > 0) {
      data.count = data.count + 1;
      data.results = [...data.results, [null, none]];
    }

    return data;
  },
});

export const subCountValueAtom = selectorFamily<
  number | null,
  { path: string; modal: boolean; value: Value }
>({
  key: "categoricalFieldSubCountsValues",
  get: ({ path, modal, value }) => ({ get }) => {
    if (!get(hasFilters(modal))) {
      return null;
    }
    const counts = get(countsAtom({ path, modal, filtered: true }));

    if (!counts) {
      return null;
    }
    const result = counts.results.filter(([v]) => v === value);

    if (result.length) {
      return result[0][1];
    }

    return 0;
  },
});

export const labelCount = selectorFamily<number | null, boolean>({
  key: "labelCount",
  get: (modal) => ({ get }) => {
    const atom = get(hasFilters(modal)) ? filteredLabelCounts : labelCounts;

    let sum = 0;
    let counts = get(atom({ modal, key: "sample" }));
    counts &&
      get(activeLabels({ modal, frames: false })).forEach((path) => {
        if (path in counts) {
          sum += counts[path];
        }
      });

    counts = get(atom({ modal, key: "frame" }));
    counts &&
      get(activeLabels({ modal, frames: true })).forEach((path) => {
        if (path in counts) {
          sum += counts[path];
        }
      });

    return sum;
  },
});

export const tagNames = selectorFamily<string[], boolean>({
  key: "tagNames",
  get: (modal) => ({ get }) => {
    return (get(modal ? modalStats : selectors.datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (cur.name === "tags") {
          return Object.keys(cur.result).sort();
        }
        return acc;
      },
      []
    );
  },
});

export const labelTagNames = selectorFamily<string[], boolean>({
  key: "labelTagNames",
  get: (modal) => ({ get }) => {
    const paths = get(selectors.labelTagsPaths);
    const result = new Set<string>();
    (get(modal ? modalStats : selectors.datasetStats) ?? []).forEach((s) => {
      if (paths.includes(s.name)) {
        Object.keys(s.result).forEach((t) => result.add(t));
      }
    });

    return Array.from(result).sort();
  },
});
