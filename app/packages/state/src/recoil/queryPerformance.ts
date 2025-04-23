import * as foq from "@fiftyone/relay";
import {
  BOOLEAN_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_PATH,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_PRIMITIVE_TYPES,
} from "@fiftyone/utilities";
import { DefaultValue, atomFamily, selector, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import type { ResponseFrom } from "../utils";
import { config } from "./config";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { filters } from "./filters";
import { groupSlice } from "./groups";
import { isLabelPath } from "./labels";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import { datasetId, datasetName } from "./selectors";
import { State } from "./types";
import { view } from "./view";

const EXCLUDE_FIELDS = "fiftyone.core.stages.ExcludeFields";
const SELECT_FIELDS = "fiftyone.core.stages.SelectFields";
const SELECT_GROUP_SLICES = "fiftyone.core.stages.SelectGroupSlices";
const VALID_QP_STAGES = new Set([
  EXCLUDE_FIELDS,
  SELECT_FIELDS,
  SELECT_GROUP_SLICES,
]);

/**
 * Given a field path, return a set a field filters and index name that would
 * result in a optimized IXSCAN, if possible
 */
export const filterSearch = selectorFamily({
  key: "filterSearch",
  get:
    (path: string) =>
    ({ get }) => {
      const allIndexes = get(indexInfo)?.sampleIndexes ?? [];
      const f = get(filters) ?? {};
      const pathMap: { [key: string]: string } = {};
      for (const key in f) {
        pathMap[get(schemaAtoms.dbPath(key))] = key;
      }

      let result: typeof f | undefined = undefined;
      let resultName: string | undefined = undefined;

      for (const index of allIndexes) {
        if (index.key[0].field === get(schemaAtoms.dbPath(path))) {
          return { filters: {}, index: index.name };
        }
      }

      for (const index of allIndexes) {
        const current: typeof f = {};
        for (const key of index.key) {
          if (key.field === get(schemaAtoms.dbPath(path))) {
            if (
              !result ||
              Object.keys(current).length > Object.keys(result).length
            ) {
              result = current;
              resultName = index.name;
            }
            break;
          }

          if (pathMap[key.field]) {
            current[pathMap[key.field]] = f[pathMap[key.field]];
          }
        }
      }

      if (!result) {
        const active = get(validIndexes(get(filterKeys))).active;
        if (active.length) {
          result = {};
          for (const key of active[1]) {
            result[pathMap[key]] = f[pathMap[key]];
          }
          resultName = active[0];
        }
      }

      return { filters: result, index: resultName };
    },
});

export const lightningQuery = graphQLSelectorFamily<
  foq.lightningQuery$variables,
  foq.LightningInput["paths"],
  ResponseFrom<foq.lightningQuery>["lightning"]
>({
  environment: RelayEnvironmentKey,
  key: "lightningQuery",
  query: foq.lightning,
  mapResponse: (response) => response.lightning,
  variables:
    (paths) =>
    ({ get }) => {
      return {
        input: {
          dataset: get(datasetName),
          paths,
          slice: get(groupSlice),
        },
      };
    },
});

export const indexInfo = foq.graphQLSyncFragmentAtom<foq.indexesFragment$key>(
  {
    keys: ["dataset"],
    fragments: [foq.datasetFragment, foq.indexesFragment],
  },
  {
    key: "indexInfo",
  }
);

const indexKeysMatch = (one: string[], two: Set<string>) =>
  one.length <= two.size && [...one].every((o) => two.has(o));

export const validIndexes = selectorFamily({
  key: "validIndexes",
  get:
    (keys: Set<string>) =>
    ({ get }) => {
      const allIndexes = get(indexInfo)?.sampleIndexes ?? [];
      const keyList = [...keys].map((k) => get(schemaAtoms.dbPath(k)));

      let matched: string | undefined;
      let matchedKeys = [];
      const trailing: [string, string][] = [];
      const available: [string, string][] = [];
      for (const index of allIndexes) {
        const indexKeys = index.key
          .slice(0, keys.size)
          .map(({ field }) => field);
        if (indexKeysMatch(indexKeys, new Set(keyList))) {
          if (indexKeys.length && indexKeys.length > matchedKeys.length) {
            matched = index.name;
            matchedKeys = indexKeys.map((field) =>
              get(schemaAtoms.fieldPath(field))
            );
          }

          index.key[keys.size]?.field &&
            available.push([index.name, index.key[keys.size].field]);

          if (index.key[keys.size - 1]) {
            trailing.push([index.name, index.key[keys.size - 1].field]);
          }
        }
      }

      return {
        // indexes whose have a field available, e.g. a compound index of
        // 'ground_truth.label' and 'created_at' where 'ground_truth.label' is
        // filtered on, then 'created_at' is available
        available,

        // an active index
        active: (matched ? [matched, matchedKeys] : []) as [string, string[]],

        // trailing indexes, which can be sorted on, e.g. filtering by
        // 'created_at' and then sorting by it
        trailing,
      };
    },
});

export const activeIndex = selector({
  key: "activeIndex",
  get: ({ get }) => get(validIndexes(get(filterKeys))).active[0],
});

const firstKeyMap = selectorFamily({
  key: "firstKeyMap",
  get:
    (frames: boolean) =>
    ({ get }) => {
      const data = get(indexInfo);

      const list = frames ? data.frameIndexes : data.sampleIndexes;

      return Object.fromEntries(list.map((data) => [data.key[0].field, data]));
    },
});

const wildcardProjection = selectorFamily({
  key: "wildcardProjection",
  get:
    (frames: boolean) =>
    ({ get }) =>
      get(firstKeyMap(frames))["$**"]?.wildcardProjection,
});

export const indexesByPath = selectorFamily<
  Set<string>,
  Set<string> | undefined
>({
  key: "indexesByPath",
  get:
    (keys) =>
    ({ get }) => {
      const gatherPaths = (space: State.SPACE) =>
        get(
          schemaAtoms.fieldPaths({
            ftype: [BOOLEAN_FIELD, OBJECT_ID_FIELD, STRING_FIELD],
            space,
          })
        );

      const schema = gatherPaths(State.SPACE.SAMPLE);
      const samplesProjection = get(wildcardProjection(false));
      const framesProjection = get(wildcardProjection(true));

      const convertWildcards = (
        field: string,
        fields: string[],
        frames: boolean
      ) => {
        const projection = frames ? framesProjection : samplesProjection;

        const filtered = fields.map((field) => get(schemaAtoms.dbPath(field)));

        if (field === "$**") {
          if (!projection) {
            return filtered;
          }
          const set = new Set(projection.fields);
          const filter = projection.inclusion
            ? (f: string) => set.has(f)
            : (f: string) => !set.has(f);

          return filtered.filter(filter);
        }

        if (!field.endsWith(".$**")) {
          return [field];
        }

        const parent = field.split(".").slice(0, -1).join(".");
        return filtered.filter((field) => field.startsWith(parent));
      };

      const current = get(validIndexes(keys || new Set()));
      const result = current.active.length ? [...current.active[1]] : [];
      for (const index of current.available) {
        result.push(...convertWildcards(index[1], schema, false));
      }

      return new Set<string>(result);
    },
});

export const pathIndex = selectorFamily({
  key: "pathIndex",
  get:
    ({ path, withFilters }: { path: string; withFilters?: boolean }) =>
    ({ get }) => {
      const indexes = get(
        indexesByPath(withFilters ? get(filterKeys) : undefined)
      );
      return indexes.has(get(schemaAtoms.dbPath(path)));
    },
});

export const pathHasActiveIndex = selectorFamily({
  key: "pathHasActiveIndex",
  get:
    (path: string) =>
    ({ get }) => {
      const keys = get(filterKeys);
      const db = get(schemaAtoms.dbPath(path));
      return (
        keys.has(path) &&
        get(validIndexes(keys))
          .active.map(([_, p]) => p?.includes(db))
          .some((t) => t)
      );
    },
});

const indexMap = selector({
  key: "indexMap",
  get: ({ get }) => {
    const map: { [key: string]: Set<string> } = {};
    for (const index of get(indexInfo).sampleIndexes) {
      map[index.name] = new Set(
        index.key.map(({ field }) => get(schemaAtoms.fieldPath(field)))
      );
    }

    return map;
  },
});

export const pathHasIndexes = selectorFamily({
  key: "pathHasIndexes",
  get:
    ({ path, withFilters }: { path: string; withFilters?: boolean }) =>
    ({ get }) => {
      return !!get(indexedPaths({ path, withFilters })).size;
    },
});

const filterKeys = selector({
  key: "filterKeys",
  get: ({ get }) => {
    return new Set(Object.keys(get(filters)));
  },
});

export const indexedPaths = selectorFamily<
  Set<string>,
  { path: string; withFilters?: boolean }
>({
  key: "indexedPaths",
  get:
    ({ path, withFilters }) =>
    ({ get }) => {
      const filters = withFilters ? get(filterKeys) : undefined;
      if (path === "") {
        return get(indexesByPath(filters));
      }

      if (
        get(isLabelPath(path)) ||
        get(schemaAtoms.field(path))?.embeddedDocType ===
          DYNAMIC_EMBEDDED_DOCUMENT_PATH
      ) {
        const expanded = get(schemaAtoms.expandPath(path));
        const indexes = get(indexesByPath(filters));
        return new Set(
          get(
            schemaAtoms.fieldPaths({
              path: expanded,
              ftype: VALID_PRIMITIVE_TYPES,
            })
          )
            .map((p) => `${expanded}.${p}`)
            .filter((p) => indexes.has(get(schemaAtoms.dbPath(p))))
        );
      }

      if (get(pathIndex({ path, withFilters }))) {
        return new Set([path]);
      }

      return new Set();
    },
});

export const isQueryPerformantView = selector({
  key: "isQueryPerformantView",
  get: ({ get }) => {
    const stages = get(view);
    if (!stages?.length) {
      return true;
    }

    const stageClasses = [...new Set(stages.map(({ _cls }) => _cls))];
    return stageClasses.every((cls) => VALID_QP_STAGES.has(cls));
  },
});

export const enableQueryPerformanceConfig = selector({
  key: "enableQueryPerformanceConfig",
  get: ({ get }) => get(config).enableQueryPerformance,
});

export const defaultQueryPerformanceConfig = selector({
  key: "defaultQueryPerformanceConfig",
  get: ({ get }) => get(config).defaultQueryPerformance,
});

export const queryPerformance = selector<boolean>({
  key: "queryPerformance",
  get: ({ get }) => get(queryPerformanceSetting) && get(isQueryPerformantView),
  set: ({ set }, value) => set(queryPerformanceSetting, value),
});

export const queryPerformanceSetting = selector<boolean>({
  key: "queryPerformanceSetting",
  get: ({ get }) => {
    if (!get(enableQueryPerformanceConfig)) {
      return false;
    }

    const storedValue = get(queryPerformanceStore(get(datasetId)));
    if (storedValue !== undefined) {
      return storedValue;
    }

    return get(defaultQueryPerformanceConfig);
  },
  set: ({ get, set }, value) => {
    set(
      queryPerformanceStore(get(datasetId)),
      value instanceof DefaultValue ? undefined : value
    );
  },
});

const queryPerformanceStore = atomFamily<boolean, string>({
  key: "queryPerformanceStore",
  default: undefined,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`queryPerformance-${datasetId}`, {
      sessionStorage: true,
      valueClass: "boolean",
    }),
  ],
});

const queryPerformanceMaxSearchStore = atomFamily<number, string>({
  key: "queryPerformanceMaxSearchStore",
  default: 10000,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(
      `queryPerformanceMaxSearchResults-${datasetId}`,
      {
        sessionStorage: true,
        valueClass: "number",
      }
    ),
  ],
});

export const queryPerformanceMaxSearch = selector({
  key: "queryPerformanceMaxSearch",
  get: ({ get }) => get(queryPerformanceMaxSearchStore(get(datasetId))),
  set: ({ get, set }, value) => {
    set(
      queryPerformanceMaxSearchStore(get(datasetId)),
      value instanceof DefaultValue ? 100000 : value
    );
  },
});
