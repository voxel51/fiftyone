import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

// Tab state for GUI/JSON toggle
export const activeSchemaTab = atom<"gui" | "json">("gui");

export const currentField = atom<null | string>();

export const labelSchemasData = atom(null);

export const labelSchemaData = atomFamily((field) => {
  return atom(
    (get) => get(labelSchemasData)?.[field],
    (get, set, value) => {
      set(labelSchemasData, { ...get(labelSchemasData), [field]: value });
    }
  );
});

export const activeLabelSchemas = atom<string[] | null>(null);

export const inactiveLabelSchemas = atom((get) =>
  Object.keys(get(labelSchemasData) ?? {})
    .sort()
    .filter((field) => !(get(activeLabelSchemas) ?? []).includes(field))
);

// =============================================================================
// Interfaces for annotation schema
// =============================================================================

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

// Helper to filter schemas by condition
const selectSchemas = (
  schemas: AnnotationSchemas,
  condition: (schema: AnnotationSchema | null) => boolean
) => {
  const result: AnnotationSchemas = {};
  for (const path in schemas) {
    if (condition(schemas[path])) {
      result[path] = schemas[path];
    }
  }
  return result;
};

// Master schemas atom
export const schemas = atom<AnnotationSchemas>({});

// Single schema accessor
export const schema = atomFamily((path: string) =>
  atom(
    (get) => get(schemas)?.[path],
    (get, set, schemaValue: AnnotationSchema | null) => {
      if (!schemaValue) {
        const s = { ...get(schemas) };
        delete s[path];
        set(schemas, s);
        return;
      }
      set(schemas, { ...get(schemas), [path]: schemaValue });
    }
  )
);

// Schema config accessor
export const schemaConfig = atomFamily((path: string) =>
  atom(
    (get) => get(schema(path))?.config,
    (get, set, config?: AnnotationSchema["config"]) => {
      const next = get(schema(path)) ?? { active: false };
      set(schema(path), { ...next, config });
    }
  )
);

// Active/inactive schema selectors
export const activeSchemas = atom<AnnotationSchemas>((get) =>
  selectSchemas(get(schemas) ?? {}, (s) => !!s?.active)
);

export const inactiveSchemas = atom((get) =>
  selectSchemas(get(schemas) ?? {}, (s) => !s?.active)
);

// Custom order for active paths (null means use default sorted order)
export const activePathsOrder = atom<string[] | null>(null);

// Active paths with drag-drop ordering support
export const activePaths = atom(
  (get) => {
    const customOrder = get(activePathsOrder);
    const paths = Object.keys(get(activeSchemas) ?? {});

    if (customOrder) {
      // Use custom order, but filter to only include paths that exist
      const existingPaths = new Set(paths);
      const orderedPaths = customOrder.filter((p) => existingPaths.has(p));
      // Add any new paths that aren't in the custom order
      const newPaths = paths.filter((p) => !customOrder.includes(p));
      return [...orderedPaths, ...newPaths.sort()];
    }

    return paths.sort();
  },
  (get, set, newOrder: string[]) => {
    set(activePathsOrder, newOrder);
  }
);

export const inactivePaths = atom((get) =>
  Object.keys(get(inactiveSchemas) ?? {}).sort()
);

// =============================================================================
// Field type atoms
// =============================================================================

export const fieldTypes = atom<{ [key: string]: string }>({});

export const fieldType = atomFamily((path: string) =>
  atom((get) => {
    // First try labelSchemaData (legacy)
    const legacyData = get(labelSchemaData(path));
    if (legacyData?.type) {
      return legacyData.type;
    }

    // Then try fieldTypes atom (new)
    const types = get(fieldTypes);
    const result = types[path];
    if (result) {
      return result;
    }

    // Try parent path for nested fields
    return types[path.split(".").slice(0, -1).join(".")];
  })
);

export const fieldAttributeCount = atomFamily((path: string) =>
  atom((get) => {
    // Try new schema system first
    const schemaData = get(schema(path));
    if (schemaData?.config?.attributes) {
      return Object.keys(schemaData.config.attributes).length;
    }

    // Try legacy schema system - check labelSchema first, then defaultLabelSchema
    const legacyData = get(labelSchemaData(path));
    if (legacyData?.labelSchema?.attributes) {
      return Object.keys(legacyData.labelSchema.attributes).length;
    }
    if (legacyData?.defaultLabelSchema?.attributes) {
      return Object.keys(legacyData.defaultLabelSchema.attributes).length;
    }

    return 0;
  })
);

// =============================================================================
// Actions
// =============================================================================

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

export const deleteSchemas = atom(null, (_, set, paths: string[]) => {
  for (const path of paths) {
    // Use schema setter with null to fully remove the entry from the master schemas atom
    set(schema(path), null);
  }
});

export const showModal = atom(false);
