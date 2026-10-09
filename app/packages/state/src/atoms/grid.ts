import { DefaultValue, atom, atomFamily, selector } from "@fiftyone/reverb";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { filters } from "./filters";
import { isGroup } from "./groups";
import { datasetSampleCount } from "./dataset";
import { indexInfo, queryPerformance, validIndexes } from "./queryPerformance";
import { fieldPath, fields, isNumericField } from "./schema";
import { datasetId } from "./selectors";
import { State } from "./types";

/** Presentation fit for media rendered inside square multimodal grid tiles. */
export type MultimodalGridFit = "contain" | "cover";

const multimodalGridFitStore = atomFamily<string, string>({
  key: "multimodalGridFitStore",
  default: "cover",
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`multimodalGridFit-${datasetId}`, {
      valueClass: "string",
    }),
  ],
});

/** Validated grid fit for the active dataset, defaulting to Cover. */
export const multimodalGridFit = selector<MultimodalGridFit>({
  key: "multimodalGridFit",
  get: ({ get }) => {
    const value = get(multimodalGridFitStore(get(datasetId) ?? ""));
    return value === "contain" ? "contain" : "cover";
  },
  set: ({ get, reset, set }, value) => {
    const store = multimodalGridFitStore(get(datasetId) ?? "");
    if (value instanceof DefaultValue) {
      reset(store);
      return;
    }
    set(store, value);
  },
});

export const gridSortByStore = atomFamily<string, string>({
  key: "gridSortByStore",
  default: null,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`gridSortBy-${datasetId}`, {
      valueClass: "string",
    }),
  ],
});

export const gridSortDescendingStore = atomFamily<boolean, string>({
  key: "gridSortOrderStore",
  default: false,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`gridSortOrder-${datasetId}`, {
      valueClass: "boolean",
    }),
  ],
});

export const gridSortBy = selector<null | {
  descending: boolean;
  field: string;
}>({
  key: "gridSortBy",
  get: ({ get }) => {
    const id = get(datasetId) ?? "";
    const field = get(gridSortByStore(id));
    const descending = get(gridSortDescendingStore(id));

    const fields = get(gridSortFields);

    if (!field) {
      return null;
    }

    if (fields.length === 1) {
      return { descending, field: fields[0] };
    }

    if (!fields.includes(field)) {
      return null;
    }

    return { field, descending };
  },
  set: ({ get, set }, value) => {
    const id = get(datasetId) ?? "";
    const result =
      value instanceof DefaultValue || !value
        ? { field: null, descending: false }
        : value;
    set(gridSortByStore(id), result.field);
    set(gridSortDescendingStore(id), result.descending);
  },
});

/**
 * Whether the swimlanes view should be offered to the user — only on
 * "group" media-type datasets.
 */
export const gridSwimlanesAvailable = selector<boolean>({
  key: "gridSwimlanesAvailable",
  get: ({ get }) => get(isGroup),
});

/** Per-dataset persisted toggle for the grid's swimlanes view. Defaults to enabled. */
export const gridSwimlanesStore = atomFamily<boolean, string>({
  key: "gridSwimlanesStore",
  default: true,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`gridSwimlanes-${datasetId}`, {
      valueClass: "boolean",
    }),
  ],
});

/** Get/set wrapper around {@link gridSwimlanesStore} keyed by the active dataset. */
export const gridSwimlanes = selector<boolean>({
  key: "gridSwimlanes",
  get: ({ get }) => get(gridSwimlanesStore(get(datasetId) ?? "")),
  set: ({ get, set }, value) => {
    const id = get(datasetId) ?? "";
    set(
      gridSwimlanesStore(id),
      value instanceof DefaultValue ? true : Boolean(value),
    );
  },
});

/**
 * Collections above this many samples page by order cursors, never by
 * offset, and sort only by fields an index can sort.
 */
export const SMALL_ORDER_SIZE = 100_000;

export const gridLargeCollection = selector<boolean>({
  key: "gridLargeCollection",
  get: ({ get }) => (get(datasetSampleCount) ?? 0) > SMALL_ORDER_SIZE,
});

export const gridSortFields = selector<string[]>({
  key: "gridSortFields",
  get: ({ get }) => {
    if (get(gridLargeCollection)) {
      return [...(get(indexInfo)?.indexedSortFields ?? [])].sort();
    }

    if (!get(queryPerformance)) {
      return get(fields({ space: State.SPACE.SAMPLE }))
        .map(({ path }) => path)
        .sort()
        .filter((path) => get(isNumericField(path)) && !path.includes("."));
    }

    const f = Object.keys(get(filters) ?? {});
    const valid = get(validIndexes(f));
    const all = new Set([
      ...valid.available.map(({ key }) => key),
      ...valid.trailing.map(({ key }) => key),
    ]);

    return (
      [...all]
        .sort()
        .map((path) => get(fieldPath(path)))
        // an index may exist, but the field may not be in the schema
        .filter((path) => path && get(isNumericField(path)))
    );
  },
});

const gridAutosizingStore = atomFamily<boolean, string>({
  key: "gridAutosizingStore",
  default: true,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`gridAutosizing-${datasetId}`, {
      valueClass: "boolean",
    }),
  ],
});

export const gridAutosizing = selector({
  key: "gridAutosizing",
  get: ({ get }) => get(gridAutosizingStore(get(datasetId) ?? "")),
  set: ({ get, set }, value) =>
    set(gridAutosizingStore(get(datasetId) ?? ""), value),
});

// ensure navigator is defined
const deviceMemory =
  // @ts-ignore
  typeof navigator !== "undefined" ? navigator?.deviceMemory || 8 : 8;

export const maxGridItemsSizeBytes = atom({
  key: "maxGridItemsSizeBytes",
  default: (deviceMemory / 8) * 1e9,
  effects: [
    getBrowserStorageEffectForKey("maxGridItemsSizeBytes", {
      valueClass: "number",
    }),
  ],
});
