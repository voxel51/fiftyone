import * as jsonpatch from "fast-json-patch";

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
  return jsonpatch.compare(from, to);
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
