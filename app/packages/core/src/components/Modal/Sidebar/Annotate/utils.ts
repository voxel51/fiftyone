/**
 * Coerces string booleans to true booleans.
 * Note: this happens often in SchemaIO, and ideally would be fixed there.
 *
 * @param records - The records to sanitize
 * @returns The sanitized records
 */
export function coerceStringBooleans(
  misc: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(misc).map(([key, value]) => {
      if (value === "true") return [key, true];
      if (value === "false") return [key, false];
      return [key, value];
    })
  );
}
