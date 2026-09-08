/** Keeps the first unique, non-empty strings within explicit size bounds. */
export function sanitizeBoundedStringList(
  raw: readonly unknown[],
  maxItems: number,
  maxLength: number,
): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (result.length >= maxItems) break;
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > maxLength ||
      seen.has(value)
    ) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
