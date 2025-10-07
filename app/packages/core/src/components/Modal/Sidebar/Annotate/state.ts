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
  config?: {
    attributes: Record<string, any>;
    classes?: string[];
  };
}
export interface AnnotationSchemas {
  [key: string]: AnnotationSchema | null;
}

export const activePaths = atom((get) =>
  Object.keys(get(activeSchemas) ?? {}).sort()
);

export const activeSchemas = atom<AnnotationSchemas>((get) =>
  selectSchemas(get(schemas) ?? {}, (schema) => !!schema?.active)
);

export const addToActiveSchemas = atom(null, (get, set, add: Set<string>) => {
  for (const path of add) {
    set(schema(path), { ...get(schema(path)), active: true });
  }
});

export const removeFromActiveSchemas = atom(
  null,
  (get, set, remove: Set<string>) => {
    for (const path of remove) {
      set(schema(path), { ...get(schema(path)), active: false });
    }
  }
);

export const inactivePaths = atom((get) =>
  Object.keys(get(inactiveSchemas) ?? {}).sort()
);
export const inactiveSchemas = atom((get) =>
  selectSchemas(get(schemas) ?? {}, (schema) => !schema?.active)
);

export const schemas = atom<AnnotationSchemas | null>(null);

export const fieldTypes = atom<{ [key: string]: string }>({});
export const fieldType = atomFamily((path: string) =>
  atom((get) => {
    const types = get(fieldTypes);
    const result = types[path];

    if (!result) {
      return types[path.split(".").slice(0, -1).join(".")];
    }

    return result;
  })
);

export const schema = atomFamily((path: string) =>
  atom(
    (get) => {
      return get(schemas)?.[path];
    },
    (get, set, schema: AnnotationSchema | null) => {
      if (!schema) {
        const s = { ...get(schemas) };
        delete s[path];

        set(schemas, s);
        return;
      }
      set(schemas, { ...get(schemas), [path]: schema });
    }
  )
);

export const schemaConfig = atomFamily((path: string) =>
  atom(
    (get) => {
      return get(schema(path))?.config;
    },
    (get, set, config?: object) => {
      const next = get(schema(path)) ?? { active: false };
      set(schema(path), { ...next, config });
    }
  )
);

export const deleteSchemas = atom(null, (_, set, paths: string[]) => {
  for (const path of paths) {
    set(schemaConfig(path), undefined);
  }
});

export const showModal = atom(false);
