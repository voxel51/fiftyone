import * as foq from "@fiftyone/relay";
import { VALID_KEYPOINTS } from "@fiftyone/utilities";
import { VariablesOf } from "react-relay";
import { atom, GetRecoilValue, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";

import * as filterAtoms from "./filters";
import { ResponseFrom } from "../utils";
import { groupStatistics, groupId, currentSlice } from "./groups";
import { RelayEnvironmentKey } from "./relay";
import * as selectors from "./selectors";
import * as schemaAtoms from "./schema";
import * as viewAtoms from "./view";
import { sidebarSampleId } from "./modal";
import { refresher } from "./atoms";

type DateTimeBound = { datetime: number } | null;

type DateTimeBounds = [DateTimeBound, DateTimeBound];

type Bound = number | null;

type FloatBounds = {
  bounds: [Bound, Bound];
  nan: number;
  "-inf": number;
  inf: number;
};

type Bounds = [Bound, Bound] | DateTimeBounds | FloatBounds;
type Count = number;
type None = number;
type CountValues<T> = [number, [T, number][]];

type BaseAggregations = {
  Count: Count;
  CountExists?: Count;
  None: None;
};

export type CategoricalAggregations<T = unknown> = {
  CountValues: CountValues<T>;
} & BaseAggregations;

type NumericAggregations = {
  Bounds: Bounds;
} & BaseAggregations;

type Aggregations = CategoricalAggregations | NumericAggregations;

type AggregationsData = {
  [path: string]: Aggregations;
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
      data[path] = {
        None:
          data[path].CountExists !== undefined
            ? count - data[path].CountExists
            : count - data[path].Count,
        ...data[path],
      };
    } else if (check && path.includes(".") && data[parent] && data[path]) {
      data[path] = {
        None: data[parent].Count - data[path].Count,
        ...data[path],
      };
    }
  }
};

const normalizeFilters = (filters) => {
  const names = Object.keys(filters).sort();
  const list = names.map((n) => filters[n]);
  return JSON.stringify([names, list]);
};

export const filtersAreEqual = (filtersOne, filtersTwo) => {
  return normalizeFilters(filtersOne) === normalizeFilters(filtersTwo);
};

export const aggregationsTick = atom<number>({
  key: "aggregationsTick",
  default: 0,
});

export const aggregationQuery = graphQLSelectorFamily<
  VariablesOf<foq.aggregationsQuery>,
  { extended: boolean; modal: boolean; paths: string[]; root?: boolean },
  ResponseFrom<foq.aggregationsQuery>
>({
  key: "aggregationQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) => response,
  query: foq.aggregation,
  variables:
    ({ extended, modal, paths, root = false }) =>
    ({ get }) => {
      const mixed = get(groupStatistics(modal)) === "group";

      return {
        form: {
          index: get(refresher),
          dataset: get(selectors.datasetName),
          extendedStages: root ? [] : get(selectors.extendedStagesUnsorted),
          filters:
            extended && !root
              ? get(modal ? filterAtoms.modalFilters : filterAtoms.filters)
              : null,
          groupId: !root && modal && mixed ? get(groupId) : null,
          hiddenLabels: !root ? get(selectors.hiddenLabelsArray) : [],
          paths,
          mixed,
          sampleIds: !root && modal && !mixed ? [get(sidebarSampleId)] : [],
          slice: get(currentSlice(modal)),
          view: !root ? get(viewAtoms.view) : [],
        },
      };
    },
});

export const aggregations = selectorFamily({
  key: "aggregations",
  get:
    (params: { extended: boolean; modal: boolean; paths: string[] }) =>
    ({ get }) => {
      let extended = params.extended;
      if (extended && !get(filterAtoms.hasFilters(params.modal))) {
        extended = false;
      }

      return get(aggregationQuery({ ...params, extended })).aggregations;
    },
});

export const aggregation = selectorFamily({
  key: "aggregation",
  get:
    ({
      path,
      ...params
    }: {
      extended: boolean;
      modal: boolean;
      path: string;
    }) =>
    ({ get }) => {
      return get(
        aggregations({ ...params, paths: get(schemaAtoms.filterFields(path)) })
      ).filter((data) => data.path === path)[0];
    },
});

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean; extended: boolean }
>({
  key: "noneCount",
  get:
    (params) =>
    ({ get }) => {
      const data = get(aggregation(params));
      const parent = params.path.split(".").slice(0, -1).join(".");
      return (get(count({ ...params, path: parent })) as number) - data.count;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const labelTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "labelTagCounts",
  get:
    ({ modal, extended }) =>
    ({ get }) => {
      const data = get(schemaAtoms.labelPaths({})).map((path) =>
        get(aggregation({ extended, modal, path: `${path}.tags` }))
      );
      const result = {};

      for (let i = 0; i < data.length; i++) {
        const { values } = data[i];
        for (let j = 0; j < values.length; j++) {
          const { value, count } = values[j];
          if (!result[value]) {
            result[value] = 0;
          }

          result[value] += count;
        }
      }

      return result;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const sampleTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "sampleTagCounts",
  get:
    (params) =>
    ({ get }) =>
      Object.fromEntries(
        get(aggregation({ ...params, path: "tags" })).values.map(
          ({ value, count }) => [value, count]
        )
      ),
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const stringCountResults = selectorFamily<
  { count: number; results: [string | null, number][] },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "stringCountResults",
  get:
    (params) =>
    ({ get }) => {
      const keys = params.path.split(".");
      let parent = keys[0];
      let field = get(schemaAtoms.field(parent));
      if (!field && parent === "frames") {
        parent = `frames.${keys[1]}`;
      }

      if (
        VALID_KEYPOINTS.includes(get(schemaAtoms.field(parent)).embeddedDocType)
      ) {
        const skeleton = get(selectors.skeleton(parent));

        return {
          count: skeleton.labels.length,
          results: skeleton.labels.map((label) => [label as string | null, -1]),
        };
      }

      let { values, count } = get(aggregation(params));

      const results: [string | null, number][] = values.map(
        ({ count, value }) => [value, count]
      );
      const none: number = get(noneCount(params));

      if (none) {
        results.push([null, none]);
        count++;
      }

      return {
        count,
        results,
      };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const booleanCountResults = selectorFamily<
  { count: number; results: [boolean | null, number][] },
  { path: string; modal: boolean; extended: boolean }
>({
  key: "booleanCountResults",
  get:
    (params) =>
    ({ get }) => {
      const data = get(aggregation(params));
      return {
        count: data.false + data.true,
        results: [
          [false, data.false],
          [true, data.true],
          [null, get(noneCount(params))],
        ],
      };
    },
});

export const labelCount = selectorFamily<
  number | null,
  { modal: boolean; extended: boolean }
>({
  key: "labelCount",
  get:
    (params) =>
    ({ get }) => {
      let sum = 0;

      for (const path of get(
        schemaAtoms.activeLabelPaths({ modal: params.modal })
      )) {
        const data = get(aggregation({ ...params, path }));
        sum += data.count;
      }

      return sum;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
export const values = selectorFamily<
  string[],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "values",
  get:
    (params) =>
    ({ get }) => {
      return get(aggregation(params))
        .values.map(({ value }) => value)
        .sort();
    },

  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const count = selectorFamily<
  number,
  {
    extended: boolean;
    path: string;
    modal: boolean;
    value?: string | null;
  }
>({
  key: "count",
  get:
    ({ value, ...params }) =>
    ({ get }) => {
      if (params.path === "_") {
        return get(aggregation({ ...params, path: "" })).slice;
      }

      const exists =
        Boolean(get(schemaAtoms.field(params.path))) || !params.path;

      if (!exists) {
        const split = params.path.split(".");

        if (split[0] === "tags") {
          return get(counts({ ...params, path: "tags" }))[
            split.slice(1).join(".")
          ];
        }

        if (split.length < 2) {
          // this will never resolve, which allows for incoming schema changes
          // this shouldn't be necessary, but there is a mismatch between
          // aggs and schema when there is a field change
          return new Promise(() => {});
        }

        const parent = split.slice(0, split.length - 1).join(".");

        return get(counts({ ...params, path: parent }))[
          split[split.length - 1]
        ];
      }

      if (value === null) {
        return get(noneCount(params));
      }

      if (value !== undefined) {
        return get(counts(params))[value] || 0;
      }

      return get(aggregation(params)).count as number;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const counts = selectorFamily<
  { [key: string]: number },
  { extended: boolean; path: string; modal: boolean }
>({
  key: "counts",
  get:
    (params) =>
    ({ get }) => {
      const exists = Boolean(get(schemaAtoms.field(params.path)));

      if (!exists) {
        const parent = params.path.split(".")[0];

        if (
          VALID_KEYPOINTS.includes(
            get(schemaAtoms.field(parent)).embeddedDocType
          )
        ) {
          const skeleton = get(selectors.skeleton(parent));

          return skeleton.labels.reduce((acc, cur) => {
            acc[cur] = -1;
            return acc;
          }, {});
        }
      }

      const data = get(aggregation(params));

      if (data.values) {
        return Object.fromEntries(
          data.values.map(({ count, value }) => [value, count])
        );
      }

      return Object.fromEntries(get(booleanCountResults(params)).results);
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const gatherPaths = (
  get: GetRecoilValue,
  ftype: string | string[],
  embeddedDocType?: string | string[]
) => {
  const paths = [];

  const recurseFields = (path) => {
    const field = get(schemaAtoms.field(path));

    if (get(schemaAtoms.meetsType({ path, ftype, embeddedDocType }))) {
      paths.push(path);
    }
    if (field.fields) {
      Object.keys(field.fields).forEach((name) =>
        recurseFields(`${path}.${name}`)
      );
    }
  };

  const schema = get(schemaAtoms.fieldPaths({}));
  for (const path of schema) recurseFields(path);
  return paths;
};

export const cumulativeCounts = selectorFamily<
  { [key: string]: number },
  {
    extended: boolean;
    path: string;
    modal: boolean;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "cumulativeCounts",
  get:
    ({ extended, path: key, modal, ftype, embeddedDocType }) =>
    ({ get }) => {
      return gatherPaths(get, ftype, embeddedDocType).reduce((result, path) => {
        const data = get(counts({ extended, modal, path: `${path}.${key}` }));
        for (const value in data) {
          if (!result[value]) {
            result[value] = 0;
          }

          result[value] += data[value];
        }
        return result;
      }, {});
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const cumulativeValues = selectorFamily<
  string[],
  {
    extended: boolean;
    path: string;
    modal: boolean;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "cumulativeValues",
  get:
    ({ extended, path: key, modal, ftype, embeddedDocType }) =>
    ({ get }) => {
      return Array.from(
        new Set<string>(
          gatherPaths(get, ftype, embeddedDocType).reduce(
            (result, path) => [
              ...result,
              ...get(values({ extended, modal, path: `${path}.${key}` })),
            ],
            []
          )
        )
      ).sort();
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const bounds = selectorFamily<
  [Bound, Bound],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "bounds",
  get:
    (params) =>
    ({ get }) => {
      const { min, max } = get(aggregation(params));

      return [min, max];
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export type Nonfinite = "nan" | "ninf" | "inf" | "none";

export interface NonfiniteCounts {
  none: number;
  inf?: number;
  ninf?: number;
  nan?: number;
}

export const nonfiniteCounts = selectorFamily<
  NonfiniteCounts,
  { extended: boolean; path: string; modal: boolean }
>({
  key: "nonfiniteCounts",
  get:
    (params) =>
    ({ get }) => {
      const { inf, nan, ninf, exists } = get(aggregation(params));

      const { count: parentCount } = get(
        aggregation({
          ...params,
          path: params.path.split(".").slice(0, -1).join("."),
        })
      );
      return {
        inf: inf === undefined ? 0 : inf,
        nan: nan === undefined ? 0 : nan,
        ninf: ninf === undefined ? 0 : ninf,
        none: parentCount - exists,
      };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const nonfiniteCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean; key: Nonfinite }
>({
  key: "nonfiniteCount",
  get:
    ({ key, ...params }) =>
    ({ get }) =>
      get(nonfiniteCounts(params))[key],
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const boundedCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean }
>({
  key: "boundedCount",
  get:
    (params) =>
    ({ get }) => {
      const nonfinites = Object.entries(get(nonfiniteCounts(params))).reduce(
        (sum, [key, count]) => (key === "none" ? sum : sum + (count || 0)),
        0
      );

      return get(count(params)) - nonfinites;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});
