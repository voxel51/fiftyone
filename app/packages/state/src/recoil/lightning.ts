import * as foq from "@fiftyone/relay";
import {
  BOOLEAN_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_PRIMITIVE_TYPES,
} from "@fiftyone/utilities";
import { selector, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { ResponseFrom } from "../utils";
import { config } from "./config";
import { datasetSampleCount } from "./dataset";
import { isLabelPath } from "./labels";
import { count } from "./pathData";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import { datasetName } from "./selectors";
import { State } from "./types";
import { view } from "./view";

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
      ).map((p) => get(schemaAtoms.dbPath(p)));

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

      if (field === "$**") {
        if (!projection) {
          return fields;
        }
        const set = new Set(projection.fields);
        const filter = projection.inclusion
          ? (f: string) => set.has(f)
          : (f: string) => !set.has(f);

        return fields.filter(filter);
      }

      if (!field.endsWith(".$**")) {
        return field;
      }

      const parent = field.split(".").slice(0, -1).join(".");
      return fields.filter((field) => field.startsWith(parent));
    };

    return new Set([
      ...samples
        .map(({ key: [{ field }] }) => convertWildcards(field, schema, false))
        .flat(),
      ...frames
        .map(({ key: [{ field }] }) =>
          convertWildcards(field, frameSchema, true)
        )
        .flat()
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

export const lightningPaths = selectorFamily<Set<string>, string>({
  key: "lightningPaths",
  get:
    (path: string) =>
    ({ get }) => {
      if (path === "") {
        return get(indexesByPath);
      }

      if (get(isLabelPath(path))) {
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

export const pathIsLocked = selectorFamily({
  key: "pathIsLocked",
  get:
    (path: string) =>
    ({ get }) => {
      return !get(lightningPaths(path)).size;
    },
});

export const lightningThreshold = selector({
  key: "lightningThreshold",
  get: ({ get }) => get(config).lightningThreshold,
});

export const lightning = selector({
  key: "lightning",
  get: ({ get }) => {
    if (get(view).length) {
      return false;
    }

    const threshold = get(lightningThreshold);
    if (threshold === null) {
      return false;
    }

    return get(datasetSampleCount) >= threshold;
  },
});

export const isLightningPath = selectorFamily({
  key: "isLightningPath",
  get:
    (path: string) =>
    ({ get }) => {
      return get(lightning) && !get(pathIsLocked(path));
    },
});

export const lightningUnlocked = selector({
  key: "lightningUnlocked",
  get: ({ get }) => {
    if (!get(lightning)) {
      return false;
    }

    return (
      get(count({ path: "", extended: false, modal: false, lightning: true })) <
      get(lightningThreshold)
    );
  },
});
