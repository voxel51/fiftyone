/**
 * Dot-path and JSON-pointer helpers used by the {@link Sample} model and its
 * diff/reconcile engine. Unrelated to the filesystem/URL path utilities in
 * `../paths.ts`.
 */

/** Read the value at a dot-delimited path, or `undefined` if any segment is absent. */
export const getNestedField = <T>(
  data: Record<string, unknown> | undefined,
  path: string
): T | undefined => {
  if (!data) {
    return undefined;
  }

  let current: unknown = data;
  for (const part of path.split(".")) {
    if (
      current !== null &&
      typeof current === "object" &&
      part in (current as object)
    ) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current as T;
};

/**
 * Read the value at a sequence of JSON-pointer segments (object keys / array
 * indices) within a value, or `undefined` if any segment is absent.
 */
export const getAtPath = (root: unknown, segments: string[]): unknown => {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

/**
 * Return a copy of `root` with the leaf at the given JSON-pointer segments
 * removed, copying each node along the path (copy-on-write) so values shared
 * with other structures (e.g. `sourceData`) are not mutated. Returns `root`
 * unchanged if the path is absent.
 */
export const withoutPath = (root: unknown, segments: string[]): unknown => {
  if (segments.length === 0 || root === null || typeof root !== "object") {
    return root;
  }

  const [head, ...tail] = segments;
  const clone: Record<string, unknown> | unknown[] = Array.isArray(root)
    ? [...root]
    : { ...root };

  if (!(head in clone)) {
    return clone;
  }

  if (tail.length === 0) {
    delete (clone as Record<string, unknown>)[head];
  } else {
    (clone as Record<string, unknown>)[head] = withoutPath(
      (clone as Record<string, unknown>)[head],
      tail
    );
  }

  return clone;
};

/**
 * Combine a dot-delimited field path with a JSON-patch-style operation path
 * into a single absolute JSON pointer.
 */
export const buildJsonPath = (
  fieldPath: string,
  operationPath: string
): string => {
  const parts = fieldPath.split(".").filter(Boolean);
  parts.push(
    ...operationPath.split("/").filter((s) => s.length > 0 && s !== "/")
  );

  return `/${parts.join("/")}`;
};
