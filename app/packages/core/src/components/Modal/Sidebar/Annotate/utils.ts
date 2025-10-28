/**
 * Coerces string booleans to true booleans.
 * Note: this happens often in SchemaIO, and ideally would be fixed there.
 * Of course it means we do not accept string "true" or "false" as valid values,
 * which is why it's a temporary fix and we should address this in SchemaIO.
 * @todo
 *
 * @param records - The records to sanitize
 * @returns The sanitized records
 */
export function coerceStringBooleans(
  records: Record<string, unknown>
): Record<string, unknown> {
  if (typeof records !== "object" || records === null) return records;

  return Object.fromEntries(
    Object.entries(records).map(([key, value]) => {
      if (value === "true") return [key, true];
      if (value === "false") return [key, false];
      return [key, value];
    })
  );
}
