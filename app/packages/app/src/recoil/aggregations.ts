import { atom, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import { request } from "../utils/socket";

import * as atoms from "./atoms";
import * as selectors from "./selectors";
import { State } from "./types";

export const aggregationsRaw = atom<{
  view: State.Stage[];
}>({
  key: "aggregationsRaw",
  default: {
    view: null,
    stats: [],
  },
});

export const extendedAggregationsRaw = atom({
  key: "extendedAggregationsStatsRaw",
  default: {
    view: null,
    stats: [],
    filters: null,
  },
});

const modalAggregationsRaw = selector({
  key: "modalAggregationsRaw",
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

export const modalAggregations = selector({
  key: "modalAggregations",
  get: ({ get }) => get(modalAggregationsRaw),
});

const extendedModalAggregationsRaw = selector({
  key: "extendedModalAggregationsRaw",
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
  get: ({ get }) => get(extendedModalAggregationsRaw),
});

export const noneFieldCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "noneFieldCounts",
  get: (modal) => ({ get }) => {
    const raw = get(modal ? modalAggregations : aggregationsRaw);
    const video = get(selectors.isVideoDataset);

    const currentView = get(selectors.view);
    if (!raw.view) {
      return {};
    }
    if (!viewsAreEqual(raw.view, currentView)) {
      return {};
    }

    return computeNoneCounts(raw.stats, video);
  },
});

export const noneFilteredFieldCounts = selectorFamily<
  { [key: string]: number },
  boolean
>({
  key: "noneFilteredFieldCounts",
  get: (modal) => ({ get }) => {
    const raw = get(modal ? aggregationsRaw : atoms.extendedDatasetStatsRaw);
    const video = get(selectors.isVideoDataset);

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

    return computeNoneCounts(raw.stats, video);
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
          if (cur.name === "tags" && cur._CLS === AGGS.COUNT_VALUES) {
            return Object.fromEntries(cur.result[1]);
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
          if (cur.name === "tags" && cur._CLS === AGGS.COUNT_VALUES) {
            return Object.fromEntries(cur.result[1]);
          }
          return acc;
        }, {})
      : {};
  },
});

export const catchLabelCount = (
  names: string[],
  prefix: string,
  cur: { name: string; _CLS: string; result: number },
  acc: { [key: string]: number },
  types?: { [key: string]: string }
): void => {
  if (!cur.name) {
    return;
  }

  const fieldName = cur.name.slice(prefix.length).split(".")[0];

  let key = cur.name;
  if (types && LABEL_LISTS.includes(types[prefix + fieldName])) {
    key = prefix + `${fieldName}.${LABEL_LIST[types[prefix + fieldName]]}`;
  } else if (types && cur.name !== prefix + fieldName) {
    return;
  }

  if (
    names.includes(fieldName) &&
    key === cur.name &&
    cur._CLS === AGGS.COUNT
  ) {
    acc[prefix + fieldName] = cur.result;
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
    const labelTypesMap = get(selectors.labelTypesMap);
    if (stats === null) {
      return null;
    }

    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc, labelTypesMap);
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
    const labelTypesMap = get(selectors.labelTypesMap);

    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc, labelTypesMap);
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

    const primitive = get(selectors.primitiveNames("sample"));

    if (modal && primitive.includes(path)) {
      const result = get(atoms.modal).sample[path];

      if (!Array.isArray(result)) {
        return { count: 0, results: [] };
      }

      const count = result.length;

      return {
        count,
        results: Array.from(
          result
            .reduce((acc, cur) => {
              if (!acc.has(cur)) {
                acc.set(cur, 0);
              }

              acc.set(cur, acc.get(cur) + 1);

              return acc;
            }, new Map())
            .entries()
        ),
      };
    }

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
        if (cur.name === "tags" && cur._CLS === AGGS.COUNT_VALUES) {
          return cur.result[1].map(([v]) => v).sort();
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
