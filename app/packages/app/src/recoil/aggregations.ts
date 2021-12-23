import {
  atom,
  GetRecoilValue,
  RecoilValueReadOnly,
  selectorFamily,
  useRecoilValueLoadable,
} from "recoil";

import { http } from "../shared/connection";

import * as atoms from "./atoms";
import * as filterAtoms from "./filters";
import * as selectors from "./selectors";
import * as schemaAtoms from "./schema";
import * as viewAtoms from "./view";
import { DATE_FIELD, DATE_TIME_FIELD, FLOAT_FIELD } from "@fiftyone/utilities";

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
  None: None;
};

type CategoricalAggregations<T = unknown> = {
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
        None: count - data[path].Count,
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

const aggregations = selectorFamily<
  AggregationsData,
  { modal: boolean; extended: boolean }
>({
  key: "aggregations",
  get: ({ modal, extended }) => async ({ get }) => {
    let filters = null;
    if (extended && get(filterAtoms.hasFilters(modal))) {
      filters = get(modal ? filterAtoms.modalFilters : filterAtoms.filters);
    } else if (extended) {
      return get(aggregations({ extended: false, modal })) as AggregationsData;
    }

    get(aggregationsTick);
    const data = (await (
      await fetch(`${http}/aggregations`, {
        cache: "no-cache",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "cors",
        body: JSON.stringify({
          filters,
          sample_id: modal ? get(atoms.modal).sample._id : null,
          dataset: get(selectors.datasetName),
          view: get(viewAtoms.view),
        }),
      })
    ).json()) as AggregationsData;

    data && addNoneCounts(data, get(selectors.isVideoDataset));

    return data;
  },
}) as (param: {
  modal: boolean;
  extended: boolean;
}) => RecoilValueReadOnly<AggregationsData>;

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean; extended: boolean }
>({
  key: "noneCount",
  get: ({ extended, path, modal }) => ({ get }) => {
    return get(aggregations({ modal, extended }))[path].None;
  },
});

export const labelTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "labelTagCounts",
  get: ({ modal, extended }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }));
    const paths = get(schemaAtoms.labelPaths({})).map((path) => `${path}.tags`);
    const result = {};

    for (const path of paths) {
      const pathData = data[path] as CategoricalAggregations;
      for (const [tag, count] of Object.entries(pathData.CountValues)) {
        if (!result[tag]) {
          result[tag] = 0;
        }

        result[tag] += count;
      }
    }

    return result;
  },
});

export const sampleTagCounts = selectorFamily<
  { [key: string]: number },
  { modal: boolean; extended: boolean }
>({
  key: "sampleTagCounts",
  get: ({ modal, extended }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }))
      .tags as CategoricalAggregations;
    return Object.fromEntries(data.CountValues[1]);
  },
});

const makeCountResults = <T>(key) =>
  selectorFamily<
    { count: number; results: [T, number][] },
    { path: string; modal: boolean; extended: boolean }
  >({
    key,
    get: ({ extended, path, modal }) => ({ get }) => {
      const data = get(aggregations({ modal, extended }))[
        path
      ] as CategoricalAggregations<T>;
      const results = [...data.CountValues[1]];

      let count = data.CountValues[0];
      if (data.None) {
        results.push([null, data.None]);
        count++;
      }

      return {
        count,
        results,
      };
    },
  });

export const booleanCountResults = makeCountResults<boolean | null>(
  "booleanCountResults"
);

export const stringCountResults = makeCountResults<string | null>(
  "stringCountResults"
);

export const labelCount = selectorFamily<number | null, boolean>({
  key: "labelCount",
  get: (modal) => ({ get }) => {
    let sum = 0;
    const data = get(aggregations({ modal, extended: false }));

    for (const label of get(schemaAtoms.activeLabelPaths({ modal }))) {
      sum += data[label].Count;
    }

    return sum;
  },
});
export const values = selectorFamily<
  string[],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "values",
  get: ({ extended, path, modal }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }));

    if (data) {
      const agg = data[path] as CategoricalAggregations<string>;
      return agg.CountValues[1].map(([value]) => value).sort();
    }

    return [];
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
  get: ({ extended, path, modal, value }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }));
    if (!data) {
      return null;
    }

    const result = data[path];
    if (!result) {
      const split = path.split(".");

      if (split.length < 2) {
        throw new Error(`invalid path ${path}`);
      }

      const parent = split.slice(0, split.length - 1).join(".");
      if (data[parent]) {
        return get(counts({ extended, path: parent, modal }))[
          split[split.length - 1]
        ];
      }
    }

    if (value === null) {
      return result.None;
    }

    if (value !== undefined) {
      return get(counts({ extended, path, modal }))[value] || 0;
    }

    return data[path].Count;
  },
});

export const counts = selectorFamily<
  { [key: string]: number },
  { extended: boolean; path: string; modal: boolean }
>({
  key: "counts",
  get: ({ extended, modal, path }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }));
    return data
      ? Object.fromEntries(
          (data[path] as CategoricalAggregations).CountValues[1]
        )
      : null;
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
  get: ({ extended, path: key, modal, ftype, embeddedDocType }) => ({ get }) =>
    gatherPaths(get, ftype, embeddedDocType).reduce((result, path) => {
      const data = get(counts({ extended, modal, path: `${path}.${key}` }));
      for (const value in data) {
        if (!result[value]) {
          result[value] = 0;
        }

        result[value] += data[value];
      }
      return result;
    }, {}),
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
  get: ({ extended, path: key, modal, ftype, embeddedDocType }) => ({
    get,
  }) => {
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
});

export const bounds = selectorFamily<
  [Bound, Bound],
  { extended: boolean; path: string; modal: boolean }
>({
  key: "bounds",
  get: ({ extended, modal, path }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }))[
      path
    ] as NumericAggregations;

    const isDateOrDateTime = get(
      schemaAtoms.meetsType({ path, ftype: [DATE_FIELD, DATE_TIME_FIELD] })
    );

    if (isDateOrDateTime) {
      const [lower, upper] = data.Bounds as DateTimeBounds;

      return [lower.datetime, upper.datetime] as [Bound, Bound];
    }

    const isFloatField = get(
      schemaAtoms.meetsType({ path, ftype: FLOAT_FIELD })
    );

    if (isFloatField) {
      return (data.Bounds as FloatBounds).bounds;
    }

    return data.Bounds as [Bound, Bound];
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
  get: ({ extended, modal, path }) => ({ get }) => {
    const data = get(aggregations({ modal, extended }))[
      path
    ] as NumericAggregations;

    const isFloatField = get(
      schemaAtoms.meetsType({ path, ftype: FLOAT_FIELD })
    );

    const result = { none: data.None };

    if (isFloatField) {
      const bounds = data.Bounds as FloatBounds;
      return {
        ...result,
        nan: bounds.nan,
        ninf: bounds["-inf"],
        inf: bounds.inf,
      };
    }

    return result;
  },
});

export const nonfiniteCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean; key: Nonfinite }
>({
  key: "nonfiniteCount",
  get: ({ key, ...params }) => ({ get }) => get(nonfiniteCounts(params))[key],
});

export const boundedCount = selectorFamily<
  number,
  { extended: boolean; path: string; modal: boolean }
>({
  key: "boundedCount",
  get: (params) => ({ get }) => {
    const nonfinites = Object.values(get(nonfiniteCounts(params))).reduce(
      (sum, count) => sum + count,
      0
    );

    return get(count(params)) - nonfinites;
  },
});

export const useLoading = (params: { extended: boolean; modal: boolean }) => {
  const { state } = useRecoilValueLoadable(aggregations(params));

  return state === "loading";
};
