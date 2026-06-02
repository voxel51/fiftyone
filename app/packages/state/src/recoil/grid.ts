import { DefaultValue, atom, atomFamily, selector } from "recoil";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { filters } from "./filters";
import { isGroup } from "./groups";
import { lightningBounds } from "./pathData/lightningNumeric";
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

/** Per-dataset persisted toggle for the grid's right-edge scrubber. Defaults to enabled. */
export const gridScrubberStore = atomFamily<boolean, string>({
  key: "gridScrubberStore",
  default: true,
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
      value instanceof DefaultValue ? true : Boolean(value)
    );
  },
});

/**
 * Whether the grid scrubber should be offered to the user. The scrubber
 * is only meaningful when the grid is sorting (which is itself only
 * possible in query performance mode), so the toggle and the right-edge
 * chrome are both hidden otherwise.
 */
export const gridScrubberAvailable = selector<boolean>({
  key: "gridScrubberAvailable",
  get: ({ get }) => get(gridSortBy) !== null,
});

/**
 * Whether the swimlanes view should be offered to the user — only on
 * "group" media-type datasets.
 */
export const gridSwimlanesAvailable = selector<boolean>({
  key: "gridSwimlanesAvailable",
  get: ({ get }) => get(isGroup),
});

/**
 * `[min, max]` bounds for the current sort field. Consumers must already
 * have ensured query performance is on and a numeric sort field is
 * selected (the selector returns `null` only if its caller wires it up
 * outside that contract).
 *
 * Reads from the standard `pathData.bounds` aggregation, which under
 * query performance is served from the lightning data flow without a
 * separate full-collection scan.
 */
export const gridSortFieldBounds = selector<[number, number] | null>({
  key: "gridSortFieldBounds",
  get: ({ get }) => {
    const sort = get(gridSortBy);
    if (!sort) return null;
    if (!get(isNumericField(sort.field))) return null;
    // In query-performance mode the standard `pathData.bounds`
    // aggregation doesn't materialize min/max; the QP data flow
    // exposes them via `lightningBounds` instead (same `pathData/`
    // module, populated from indexed-field metadata). Returns
    // `[null, null]` when the field isn't indexed under QP — guard.
    const result = get(lightningBounds(sort.field));
    const [min, max] = result;
    if (typeof min !== "number" || typeof max !== "number") return null;
    return [min, max];
  },
});

/**
 * Active scrub cursor (the sort-field value the user has dragged the
 * scrubber thumb to). `null` means the scrubber is idle or unmounted.
 * Transient — not persisted; the grid resets it on view / sort changes.
 *
 * Consumed by `pageParameters` to send `cursor_pagination=true` with
 * `after=value` so the grid's next mount seeks to this value instead of
 * starting at page 0.
 */
export const gridScrubCursor = atomFamily<string | null, string>({
  key: "gridScrubCursor",
  default: null,
});

/**
 * `true` while the user is actively dragging the scrubber thumb. Drives
 * the grid's falling-pixels overlay so the underlying view visibly stops
 * tracking real data for the duration of the drag, then resumes on
 * release (when the new "AT" location loads).
 */
export const gridScrubbing = atom<boolean>({
  key: "gridScrubbing",
  default: false,
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
      value instanceof DefaultValue ? true : Boolean(value)
    );
  },
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
