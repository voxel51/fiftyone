import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

// Tab state for GUI/JSON toggle
export const activeSchemaTab = atom<"gui" | "json">("gui");

export const currentField = atom<null | string>();

export const labelSchemasData = atom(null);

export const labelSchemaData = atomFamily((field: string) => {
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

// Custom order for active paths (null means use default sorted order)
export const activePathsOrder = atom<string[] | null>(null);

// Active paths with drag-drop ordering support
export const activePaths = atom(
  (get) => {
    const customOrder = get(activePathsOrder);
    const paths: string[] = [];

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
  (_, set, newOrder: string[]) => {
    set(activePathsOrder, newOrder);
  }
);

// =============================================================================
// Field type atoms
// =============================================================================

export const fieldTypes = atom<{ [key: string]: string }>({});

export const fieldType = atomFamily((path: string) =>
  atom((get) => {
    const legacyData = get(labelSchemaData(path));
    return legacyData.type;
  })
);

export const fieldAttributeCount = atomFamily((path: string) =>
  atom((get) => {
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

export const showModal = atom(false);
