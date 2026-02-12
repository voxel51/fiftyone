import * as jsonpatch from "fast-json-patch";

/**
 * Normalize data for accurate comparison.
 *
 * @param data Data to normalize
 */
const normalizeData = (data: unknown): unknown => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // convert dates from {_cls: "DateTime": datetime: 12345...} to iso strings
    if (obj._cls === "DateTime" && typeof obj.datetime === "number") {
      try {
        const date = new Date(obj.datetime);
        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch (err) {
        console.warn("failed to parse date", err);
      }
    }

    // recursively normalize objects
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizeData(v)])
    );
  }

  // recursively normalize lists
  if (Array.isArray(data)) {
    return data.map(normalizeData);
  }

  return data;
};

/**
 * Create an array of patches from the differences between two objects.
 *
 * @param from From object
 * @param to To object
 */
export const generateJsonPatch = <
  T extends Record<string, unknown> | unknown[]
>(
  from: T,
  to: T
): jsonpatch.Operation[] => {
  return jsonpatch.compare(normalizeData(from), normalizeData(to));
};

/**
 * Extract a dot-delimited field from a nested object.
 *
 * @param data Data record
 * @param path Dot-delimited path to nested field
 */
export const extractNestedField = <T>(
  data: Record<string, unknown>,
  path: string
): T | undefined => {
  const parts = path.split(".");

  let current = data;

  for (const part of parts) {
    if (typeof current === "object" && current[part]) {
      current = current[part];
    } else {
      // missing field
      return;
    }
  }

  // current now points to the last path segment (our value of interest)
  return current as T;
};
