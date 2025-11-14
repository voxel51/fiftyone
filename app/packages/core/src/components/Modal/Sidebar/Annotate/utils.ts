/**
 * Coerces string booleans to true booleans.
 * Note: this happens often in SchemaIO, and ideally would be fixed there.
 *
 * @todo: Because it means we do not accept string "true" or "false" as valid values,
 * it's a temporary fix and we should address this in SchemaIO.
 *
 * @param records - The records to sanitize
 * @returns The sanitized records
 */
export function coerceStringBooleans<T extends Record<string, unknown>>(
  records: T
): T {
  if (typeof records !== "object" || records === null) return records;

  return Object.fromEntries(
    Object.entries(records).map(([key, value]) => {
      if (value === "true") return [key, true];
      if (value === "false") return [key, false];

      if (
        !Array.isArray(value) &&
        typeof value === "object" &&
        value !== null
      ) {
        return [key, coerceStringBooleans(value as Record<string, unknown>)];
      }

      return [key, value];
    })
  ) as T;
}
