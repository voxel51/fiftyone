import { atom, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import { request } from "../utils/socket";
import { viewsAreEqual } from "../utils/view";

import * as atoms from "./atoms";
import * as filterAtoms from "./filters";
import * as selectors from "./selectors";
import * as viewAtoms from "./view";
import { State } from "./types";
import { modalFilters } from "./filters";

type Bounds = [number | null, number | null];
type Count = number;
type None = number;
type CountValues = [number, [string, number][]];

type BaseAggregations = {
  Count: Count;
  None: None;
};

type CategoricalAggregations = {
  CountValues: CountValues;
} & BaseAggregations;

type NumericAggregations = {
  Bounds: Bounds;
} & BaseAggregations;

type Aggregations = CategoricalAggregations | NumericAggregations;

type AggregationsData = {
  [path: string]: Aggregations;
};

type AggregationsResult = {
  view: State.Stage[];
  data: AggregationsData;
};

export const addNoneCounts = (
  data: AggregationsData,
  video: boolean = false
) => {
  let count = data[""].Count;
  const frameCount = data?.frames?.Count;
  let check = true;

  for (let path in data) {
    let parent = path.includes(".")
      ? path.split(".").slice(0, -1).join(".")
      : path;

    if (video && path.startsWith("frames.")) {
      count = frameCount;
      path = path.slice("frames.".length);
      let parent = path.includes(".")
        ? path.split(".").slice(0, -1).join(".")
        : path;

      check = path.includes(".");
      path = "frames." + path;
      parent = "frames." + parent;
    }

    if (path === parent) {
      data[path].None = count - data[path].Count;
    } else if (check && path.includes(".") && data[parent] && data[path]) {
      data[path].None = data[parent].Count - data[path].Count;
    }
  }
};

export const aggregationsRaw = atom<AggregationsResult>({
  key: "aggregationsRaw",
  default: {
    view: null,
    data: {},
  },
});

export const aggregations = selector<AggregationsData>({
  key: "aggregations",
  get: ({ get }) => {
    const { data, view } = get(aggregationsRaw);
    if (!view) {
      return null;
    }
    if (viewsAreEqual(view, get(viewAtoms.view))) {
      return data;
    }
    return null;
  },
});

type ExtendedAggregationsResult = {
  filters: State.Filters;
} & AggregationsResult;

export const extendedAggregationsRaw = atom<ExtendedAggregationsResult>({
  key: "extendedAggregationsStatsRaw",
  default: {
    view: null,
    data: {},
    filters: null,
  },
});

const modalAggregations = selector<AggregationsData>({
  key: "modalAggregations",
  get: async ({ get }) => {
    const id = uuid();
    const { data } = await request({
      type: "modal_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sample._id,
      },
    });

    addNoneCounts(data, get(selectors.isVideoDataset));

    return data;
  },
});

const extendedModalAggregations = selector<ExtendedAggregationsResult>({
  key: "extendedModalAggregations",
  get: async ({ get }) => {
    const id = uuid();
    const { data } = await request({
      type: "modal_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sample._id,
        filters: get(modalFilters),
      },
    });

    addNoneCounts(data, get(selectors.isVideoDataset));

    return data;
  },
});

const normalizeFilters = (filters) => {
  const names = Object.keys(filters).sort();
  const list = names.map((n) => filters[n]);
  return JSON.stringify([names, list]);
};

export const filtersAreEqual = (filtersOne, filtersTwo) => {
  return normalizeFilters(filtersOne) === normalizeFilters(filtersTwo);
};

export const extendedAggregations = selector({
  key: "extendedAggregations",
  get: ({ get }) => {
    const { view, filters, data } = get(extendedAggregationsRaw);
    if (!view) {
      return null;
    }
    if (!viewsAreEqual(view, get(viewAtoms.view))) {
      return null;
    }
    if (!filtersAreEqual(filters, get(filterAtoms.filters))) {
      return null;
    }

    return data;
  },
});

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean }
>({
  key: "noneCount",
  get: ({ path, modal }) => ({ get }) => {
    return get(modal)[path];
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
    return (get(modal ? m4 : selectors.datasetStats) ?? []).reduce(
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
