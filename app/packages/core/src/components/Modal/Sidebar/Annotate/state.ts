import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

export const activeSchemaTab = atom<"active" | "other">("active");

const selectSchemas = (
  schemas: AnnotationSchemas,
  condition: (schema: AnnotationSchema | null) => boolean
) => {
  const result = {};

  for (const path in schemas) {
    if (condition(schemas[path])) {
      result[path] = schemas[path];
    }
  }

  return result;
};

export interface AnnotationSchema {
  active?: boolean;
  config: true | undefined;
  type: string;
}
export interface AnnotationSchemas {
  [key: string]: AnnotationSchema | null;
}

export const activePaths = atom((get) =>
  Object.keys(get(activeSchemas) ?? {}).sort()
);

export const activeSchemas = atom((get) =>
  selectSchemas(get(schemas) ?? {}, (schema) => !!schema?.active)
);

export const addToActiveSchemas = atom(null, (get, set, add: Set<string>) => {
  for (const path of add) {
    set(schema(path), { ...get(schema(path)), active: true });
  }
});

export const removeFromActiveSchemas = atom(
  null,
  (get, set, add: Set<string>) => {
    for (const path of add) {
      set(schema(path), { ...get(schema(path)), active: true });
    }
  }
);

export const inactivePaths = atom((get) =>
  Object.keys(get(inactiveSchemas) ?? {}).sort()
);
export const inactiveSchemas = atom((get) =>
  selectSchemas(get(schemas) ?? {}, (schema) => !schema?.active)
);
export const currentPath = atom<null | string>();
export const schemas = atom<AnnotationSchemas | null>(null);

export const schema = atomFamily((path: string) =>
  atom(
    (get) => get(schemas)?.[path],
    (get, set, schema: AnnotationSchema | null) => {
      set(schemas, { ...get(schemas), [path]: schema });
    }
  )
);

export const showModal = atom(
  (get) => Boolean(get(schemas)),
  (_, set) => set(schemas, null)
);
