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

const indexes = foq.graphQLSyncFragmentAtom<foq.indexesFragment$key>(
  {
    keys: ["dataset"],
    fragments: [foq.datasetFragment, foq.indexesFragment],
  },
  {
    key: "indexes",
  }
);

const firstKeyMap = selectorFamily({
  key: "firstKeyMap",
  get:
    (frames: boolean) =>
    ({ get }) => {
      const data = get(indexes);

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

const indexesByPath = selector({
  key: "indexesByPath",
  get: ({ get }) => {
    const gatherPaths = (space: State.SPACE) =>
      get(
        schemaAtoms.fieldPaths({
          ftype: [BOOLEAN_FIELD, OBJECT_ID_FIELD, STRING_FIELD],
          space,
        })
      );

    const { sampleIndexes: samples, frameIndexes: frames } = get(indexes);

    const schema = gatherPaths(State.SPACE.SAMPLE);
    const frameSchema = gatherPaths(State.SPACE.FRAME).map((p) =>
      p.slice("frames.".length)
    );
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
        return field;
      }

      const parent = field.split(".").slice(0, -1).join(".");
      return filtered.filter((field) => field.startsWith(parent));
    };

    return new Set([
      ...samples.flatMap(({ key: [{ field }] }) =>
        convertWildcards(field, schema, false)
      ),
      ...frames
        .flatMap(({ key: [{ field }] }) =>
          convertWildcards(field, frameSchema, true)
        )
        .map((field) => `frames.${field}`),
    ]);
  },
});

export const pathIndex = selectorFamily({
  key: "pathIndex",
  get:
    (path: string) =>
    ({ get }) => {
      const indexes = get(indexesByPath);
      return indexes.has(get(schemaAtoms.dbPath(path)));
    },
});

export const pathHasIndexes = selectorFamily({
  key: "pathHasIndexes",
  get:
    (path: string) =>
    ({ get }) =>
      !!get(indexedPaths(path)).size,
});

export const indexedPaths = selectorFamily<Set<string>, string>({
  key: "indexedPaths",
  get:
    (path: string) =>
    ({ get }) => {
      if (path === "") {
        return get(indexesByPath);
      }

      if (
        get(isLabelPath(path)) ||
        get(schemaAtoms.field(path))?.embeddedDocType ===
          DYNAMIC_EMBEDDED_DOCUMENT_PATH
      ) {
        const expanded = get(schemaAtoms.expandPath(path));
        const indexes = get(indexesByPath);
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

export const queryPerformance = selector<boolean>({
  key: "queryPerformance",
  get: ({ get }) => {
    if (get(view).length) {
      return false;
    }

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
