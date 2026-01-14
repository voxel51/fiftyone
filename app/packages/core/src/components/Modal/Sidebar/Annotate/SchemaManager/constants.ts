/**
 * Constants for SchemaManager
 */

// Tab IDs for GUI/JSON toggle
export const TAB_GUI = "gui" as const;
export const TAB_JSON = "json" as const;
export const TAB_IDS = [TAB_GUI, TAB_JSON] as const;
export type TabId = typeof TAB_IDS[number];

// System read-only fields that cannot be edited or scanned
const SYSTEM_READ_ONLY_FIELDS_ARRAY = [
  "created_at",
  "id",
  "last_modified_at",
] as const;

export const SYSTEM_READ_ONLY_FIELD_NAME = "system";

export type SystemReadOnlyField = typeof SYSTEM_READ_ONLY_FIELDS_ARRAY[number];

// Use Set for O(1) lookup
const SYSTEM_READ_ONLY_FIELDS_SET = new Set<string>(
  SYSTEM_READ_ONLY_FIELDS_ARRAY
);

export const isSystemReadOnlyField = (fieldName: string): boolean =>
  SYSTEM_READ_ONLY_FIELDS_SET.has(fieldName);
