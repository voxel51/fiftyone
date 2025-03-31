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

const indexInfo = foq.graphQLSyncFragmentAtom<foq.indexesFragment$key>(
  {
    keys: ["dataset"],
    fragments: [foq.datasetFragment, foq.indexesFragment],
  },
  {
    key: "indexInfo",
  }
);

const indexKeysMatch = (one: string[], two: Set<string>) =>
  one.length === two.size && [...one].every((o) => two.has(o));

export const validIndexes = selectorFamily({
  key: "validIndexes",
  get:
    (keys: Set<string>) =>
    ({ get }) => {
      const allIndexes = get(indexInfo).sampleIndexes;

      let matched = false;
      const trailing: string[] = [];
      const available: string[] = [];
      for (const index of allIndexes) {
        const indexKeys = index.key
          .slice(0, keys.size)
          .map(({ field }) => field);
        if (indexKeysMatch(indexKeys, keys)) {
          matched = true;
          index.key[keys.size]?.field &&
            available.push(index.key[keys.size].field);

          if (index.key[keys.size - 1]) {
            trailing.push(index.key[keys.size - 1].field);
          }
        }
      }

      return { available, active: matched ? keys : [], trailing };
    },
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

export const indexesByPath = selectorFamily({
  key: "indexesByPath",
  get:
    (keys: Set<string> | undefined) =>
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
      const search =
        keys ??
        new Set(
          Object.keys(get(filters)).map((path) => get(schemaAtoms.dbPath(path)))
        );
      const current = get(validIndexes(search));
      const result = [...current.active];
      for (const field of current.available) {
        result.push(...convertWildcards(field, schema, false));
      }

      return new Set(result);
    },
});

export const pathIndex = selectorFamily({
  key: "pathIndex",
  get:
    (path: string) =>
    ({ get }) => {
      const indexes = get(indexesByPath(undefined));
      return indexes.has(get(schemaAtoms.dbPath(path)));
    },
});

export const pathHasIndexes = selectorFamily({
  key: "pathHasIndexes",
  get:
    (path: string) =>
    ({ get }) => {
      return !!get(indexedPaths(path)).size;
    },
});

export const indexedPaths = selectorFamily<Set<string>, string>({
  key: "indexedPaths",
  get:
    (path: string) =>
    ({ get }) => {
      if (path === "") {
        return get(indexesByPath(undefined));
      }

      if (
        get(isLabelPath(path)) ||
        get(schemaAtoms.field(path))?.embeddedDocType ===
          DYNAMIC_EMBEDDED_DOCUMENT_PATH
      ) {
        const expanded = get(schemaAtoms.expandPath(path));
        const indexes = get(indexesByPath(undefined));
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

      if (get(pathIndex(path))) {
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
