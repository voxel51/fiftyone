import { DefaultValue, atomFamily, selector } from "recoil";
import { getBrowserStorageEffectForKey } from "./customEffects";
import { filters } from "./filters";
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

    return [...all]
      .sort()
      .map((path) => get(fieldPath(path)))
      .filter((path) => get(isNumericField(path)));
  },
});
