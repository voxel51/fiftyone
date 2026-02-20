import { labelSchemaData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import { getDefaultStore } from "jotai";
import type { WorkingDoc } from "./types";

/**
 * Tracks last created label per field.
 */
const lastCreatedLabelByField = new Map<string, string>();

/**
 * Returns the classes list for a field from its schema, or null if unavailable.
 */
function getFieldClasses(field: string): string[] | undefined {
  const store = getDefaultStore();
  const fieldSchema = store.get(labelSchemaData(field));

  return (
    fieldSchema?.label_schema?.classes ??
    fieldSchema?.default_label_schema?.classes
  );
}

/**
 * Returns true if the given label class exists in the field's schema classes list,
 * or if the field has no classes defined.
 */
function isValidClass(labelClass: string, field: string): boolean {
  const classes = getFieldClasses(field);
  return !classes || classes.includes(labelClass);
}

/**
 * Records that a label was created for the given field.
 */
export function recordLastCreatedLabel(field: string, label: string): void {
  lastCreatedLabelByField.set(field, label);
}

/**
 * Clears session memory
 */
export function clearLastCreatedLabels(): void {
  lastCreatedLabelByField.clear();
}

/**
 * Computes the default label for a new shape in the given field.
 *
 * 1. Use the label of the last created shape in this field
 * 2. Otherwise use the most common label among visible shapes in this field
 * 3. Otherwise use the first class from the field's annotation schema
 * 4. Fallback: ""
 */
export function getDefaultLabel(field: string, workingDoc: WorkingDoc): string {
  // 1. Last created label for this field (if still valid in schema)
  const last = lastCreatedLabelByField.get(field);

  if (last !== undefined && isValidClass(last, field)) {
    return last;
  }

  // 2. Most common label among visible shapes in this field
  const labelCounts: Record<string, number> = {};

  for (const l of Object.values(workingDoc.labelsById)) {
    if (workingDoc.deletedIds.has(l._id) || l.path !== field) continue;

    const lbl = l.label;

    if (lbl) {
      labelCounts[lbl] = (labelCounts[lbl] ?? 0) + 1;
    }
  }

  const mostCommon = Object.entries(labelCounts).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  if (mostCommon) {
    return mostCommon;
  }

  // 3. First class from schema
  const classes = getFieldClasses(field);
  if (classes?.length) {
    return classes[0];
  }

  return "";
}
