import { isEqual } from "lodash";

/**
 * Recursively normalize a value for comparison. Currently collapses MongoDB
 * `{_cls: "DateTime", datetime: <ms>}` wrappers to ISO strings so a transient
 * ISO-string edit compares equal to a server-side DateTime value representing
 * the same instant. Mirrors `normalizeData` in `core/src/utils/json.ts`.
 */
export const normalizeForCompare = (data: unknown): unknown => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    if (obj._cls === "DateTime" && typeof obj.datetime === "number") {
      const date = new Date(obj.datetime);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizeForCompare(v)]),
    );
  }

  if (Array.isArray(data)) {
    return data.map(normalizeForCompare);
  }

  return data;
};

/** Deep-equality check that first normalizes both sides via {@link normalizeForCompare}. */
export const equalsNormalized = (a: unknown, b: unknown): boolean =>
  isEqual(normalizeForCompare(a), normalizeForCompare(b));
