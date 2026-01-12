/**
 * Constants for SchemaManager
 */

// System read-only fields that cannot be edited or scanned
const SYSTEM_READ_ONLY_FIELDS_ARRAY = [
  "created_at",
  "id",
  "last_modified_at",
  "tags",
] as const;

export type SystemReadOnlyField = typeof SYSTEM_READ_ONLY_FIELDS_ARRAY[number];

// Use Set for O(1) lookup
const SYSTEM_READ_ONLY_FIELDS_SET = new Set<string>(
  SYSTEM_READ_ONLY_FIELDS_ARRAY
);

export const isSystemReadOnlyField = (fieldName: string): boolean =>
  SYSTEM_READ_ONLY_FIELDS_SET.has(fieldName);
