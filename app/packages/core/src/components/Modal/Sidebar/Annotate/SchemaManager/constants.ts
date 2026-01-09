/**
 * Constants for SchemaManager
 */

// System read-only fields that cannot be edited or scanned
export const SYSTEM_READ_ONLY_FIELDS = [
  "created_at",
  "id",
  "last_modified_at",
  "tags",
] as const;

export type SystemReadOnlyField = typeof SYSTEM_READ_ONLY_FIELDS[number];

export const isSystemReadOnlyField = (fieldName: string): boolean =>
  SYSTEM_READ_ONLY_FIELDS.includes(fieldName as SystemReadOnlyField);
