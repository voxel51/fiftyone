import { DefaultValue, atomFamily, selector } from "recoil";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { isDynamicGroup } from "./dynamicGroups";
import { filters } from "./filters";
import { isGroup } from "./groups";
import { bounds } from "./pathData/numeric";
import { queryPerformance, validIndexes } from "./queryPerformance";
import { fieldPath, fields, isNumericField } from "./schema";
import { datasetId } from "./selectors";
import { State } from "./types";

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
 * Per-dataset persisted toggle for the grid's right-edge scrubber. The
 * scrubber is only rendered when {@link gridScrubberAvailable} is also true.
 */
export const gridScrubberStore = atomFamily<boolean, string>({
  key: "gridScrubberStore",
  default: false,
  effects: (datasetId) => [
    getBrowserStorageEffectForKey(`gridScrubber-${datasetId}`, {
      valueClass: "boolean",
    }),
  ],
});

/** Get/set wrapper around {@link gridScrubberStore} keyed by the active dataset. */
export const gridScrubber = selector<boolean>({
  key: "gridScrubber",
  get: ({ get }) => get(gridScrubberStore(get(datasetId) ?? "")),
  set: ({ get, set }, value) => {
    const id = get(datasetId) ?? "";
    set(
      gridScrubberStore(id),
      value instanceof DefaultValue ? false : Boolean(value)
    );
  },
});

/**
 * Whether the scrubber gate is satisfied for the current dataset state:
 * query performance is active, a sort field is selected, and that field is
 * numeric (so we can compute meaningful min/max bounds).
 */
export const gridScrubberAvailable = selector<boolean>({
  key: "gridScrubberAvailable",
  get: ({ get }) => {
    if (!get(queryPerformance)) return false;
    const sort = get(gridSortBy);
    if (!sort) return false;
    return get(isNumericField(sort.field));
  },
});

/**
 * `[min, max]` bounds for the current sort field, or `null` when no field is
 * selected, the field isn't numeric, or the bounds aggregation hasn't yet
 * resolved. Wraps `pathData.bounds` so consumers don't need to know the
 * aggregation params.
 */
export const gridSortFieldBounds = selector<[number, number] | null>({
  key: "gridSortFieldBounds",
  get: ({ get }) => {
    const sort = get(gridSortBy);
    if (!sort) return null;
    if (!get(isNumericField(sort.field))) return null;
    return get(bounds({ path: sort.field, modal: false, extended: false }));
  },
});

/**
 * Per-dataset persisted toggle for the grid's swimlanes view (one row per
 * group / dynamic-group entry). Only rendered when
 * {@link gridSwimlanesAvailable} is also true.
 */
export const gridSwimlanesStore = atomFamily<boolean, string>({
  key: "gridSwimlanesStore",
  default: false,
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
      value instanceof DefaultValue ? false : Boolean(value)
    );
  },
});

/** Swimlanes is offered only when the active dataset is grouped or dynamic-grouped. */
export const gridSwimlanesAvailable = selector<boolean>({
  key: "gridSwimlanesAvailable",
  get: ({ get }) => get(isGroup) || get(isDynamicGroup),
});

export const gridSortFields = selector({
  key: "gridSortFields",
  get: ({ get }) => {
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
