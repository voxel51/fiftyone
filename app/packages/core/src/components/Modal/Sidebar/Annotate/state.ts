import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import { capitalize } from "lodash";

export const activeSchemaTab = atom<"gui" | "json">("gui");

export const currentField = atom<null | string>();

export const labelSchemasData = atom(null);

export const labelSchemaData = atomFamily((field) => {
  return atom(
    (get) => get(labelSchemasData)[field],
    (get, set, value) => {
      set(labelSchemasData, { ...get(labelSchemasData), [field]: value });
    }
  );
});

export const activeLabelSchemas = atom<string[] | null>(null);

export const inactiveLabelSchemas = atom((get) => {
  return Object.keys(get(labelSchemasData) ?? {})
    .sort()
    .filter((field) => !(get(activeLabelSchemas) ?? []).includes(field));
});

export const fieldType = atomFamily((field: string) =>
  atom((get) => {
    const type = get(labelSchemaData(field)).type;
    return capitalize(type);
  })
);

export const fieldTypes = atom((get) =>
  (get(activeLabelSchemas) ?? []).reduce((acc, cur) => {
    acc[cur] = get(fieldType(cur));
    return acc;
  }, {})
);

export const addToActiveSchemas = atom(null, (get, set, add: Set<string>) => {
  const current: string[] = get(activeLabelSchemas) ?? [];
  set(activeLabelSchemas, [...current, ...add]);
});

export const removeFromActiveSchemas = atom(
  null,
  (get, set, remove: Set<string>) => {
    const current: string[] = get(activeLabelSchemas) ?? [];
    set(
      activeLabelSchemas,
      current.filter((field) => !remove.has(field))
    );
  }
);

export const showModal = atom(false);
