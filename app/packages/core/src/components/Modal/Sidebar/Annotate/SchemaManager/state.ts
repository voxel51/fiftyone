/**
 * State management for SchemaManager
 *
 * All atoms and atom families for the SchemaManager component are consolidated here.
 */

import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import {
  fieldAttributeCount,
  fieldType,
  inactiveLabelSchemas,
  labelSchemaData,
} from "../state";
import { isSystemReadOnlyField } from "./constants";

// =============================================================================
// Re-exports from parent state
// =============================================================================

export { currentField } from "../state";

// =============================================================================
// Field Selection State
// =============================================================================

/**
 * Selected active fields (for moving to hidden)
 */
export const selectedActiveFields = atom(new Set<string>());

/**
 * Atom family to check/toggle selection for an active field
 */
export const isActiveFieldSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedActiveFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedActiveFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedActiveFields, selected);
      // Clear hidden fields selection when selecting active fields
      if (toggle) {
        set(selectedHiddenFields, new Set());
      }
    }
  )
);

/**
 * Selected hidden fields (for moving to active)
 */
export const selectedHiddenFields = atom(new Set<string>());

/**
 * Atom family to check/toggle selection for a hidden field
 */
export const isHiddenFieldSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedHiddenFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedHiddenFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedHiddenFields, selected);
      // Clear active fields selection when selecting hidden fields
      if (toggle) {
        set(selectedActiveFields, new Set());
      }
    }
  )
);

// =============================================================================
// Field Schema State
// =============================================================================

/**
 * Check if a field has schema configured (supports both atom systems)
 */
export const fieldHasSchema = atomFamily((path: string) =>
  atom((get) => {
    // Check legacy schema system (now in camelCase)
    const legacyData = get(labelSchemaData(path));
    if (legacyData?.labelSchema) return true;
    return false;
  })
);

/**
 * Check if a field is read-only (user-set schema readOnly takes precedence)
 */
export const fieldIsReadOnly = atomFamily((path: string) =>
  atom((get) => {
    const data = get(labelSchemaData(path));
    // Check schema-level readOnly first (user-configured), then field-level (system)
    return data?.labelSchema?.readOnly || data?.readOnly || false;
  })
);

/**
 * Sorted inactive (hidden) fields:
 * - Fields with schema first
 * - Fields without schema second
 * - System read-only fields last
 */
export const sortedInactivePaths = atom((get) => {
  const fields = get(inactiveLabelSchemas);

  const withSchema: string[] = [];
  const withoutSchema: string[] = [];
  const systemReadOnly: string[] = [];

  for (const field of fields) {
    if (isSystemReadOnlyField(field)) {
      systemReadOnly.push(field);
    } else if (get(fieldHasSchema(field))) {
      withSchema.push(field);
    } else {
      withoutSchema.push(field);
    }
  }

  return [...withSchema, ...withoutSchema, ...systemReadOnly];
});

// =============================================================================
// Batched Hidden Field Metadata Selectors
// =============================================================================

/**
 * Batched field types for all hidden fields
 * Returns a map of path -> fieldType
 */
export const hiddenFieldTypes = atom((get) => {
  const fields = get(sortedInactivePaths);
  return Object.fromEntries(fields.map((f) => [f, get(fieldType(f))]));
});

/**
 * Batched attribute counts for all hidden fields
 * Returns a map of path -> attributeCount
 */
export const hiddenFieldAttrCounts = atom((get) => {
  const fields = get(sortedInactivePaths);
  return Object.fromEntries(
    fields.map((f) => [f, get(fieldAttributeCount(f))])
  );
});

/**
 * Batched hasSchema states for all hidden fields
 * Returns a map of path -> hasSchema
 */
export const hiddenFieldHasSchemaStates = atom((get) => {
  const fields = get(sortedInactivePaths);
  return Object.fromEntries(fields.map((f) => [f, get(fieldHasSchema(f))]));
});

// =============================================================================
// JSON Editor State (Full Schema Editor)
// =============================================================================

/**
 * Draft JSON content for the full schemas editor
 */
export const draftJsonContent = atom<string | null>(null);

/**
 * Validation errors for JSON editing
 */
export const jsonValidationErrors = atom<string[]>([]);

/**
 * Check if JSON has been edited
 */
export const hasJsonChanges = atom((get) => {
  return get(draftJsonContent) !== null;
});

// =============================================================================
// Edit Field Label Schema State
// =============================================================================

/**
 * Current label schema being edited (per field)
 */
export const currentLabelSchema = atomFamily((_field: string) =>
  atom<object | undefined>(undefined)
);
