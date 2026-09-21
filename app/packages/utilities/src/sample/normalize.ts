import { isEqual } from "lodash";

/**
 * The GraphQL sample-read convention for non-finite doubles (see `NONFINITE`
 * in `@fiftyone/looker` and the write-side inverse in
 * `core/src/client/transformer.ts`). Plain JSON cannot represent these, so
 * the App holds them in two representations: real NaN / Infinity in engine
 * stores, and these strings in read-shaped sample data.
 */
const NONFINITE_STRING_VALUES: ReadonlyMap<string, number> = new Map([
  ["nan", NaN],
  ["inf", Infinity],
  ["-inf", -Infinity],
]);

/**
 * Recursively normalize a value for comparison, collapsing the several
 * representations one stored value can take:
 *
 * - MongoDB `{_cls: "DateTime", datetime: <ms>}` wrappers → ISO strings, so
 *   a transient ISO-string edit compares equal to a server-side DateTime for
 *   the same instant.
 * - Extended-JSON `{$numberDouble: <string>}` wrappers → their number, the
 *   server's encoding for non-finite doubles.
 * - `"nan"` / `"inf"` / `"-inf"` strings → their number, the sample-read
 *   convention for the same values.
 *
 * The non-finite collapses matter for keypoints: a skipped node's coordinate
 * is `[NaN, NaN]`, and an unequal compare against its own persisted echo
 * makes the save loop re-send the same patch every autosave tick, forever.
 * Mirrors `normalizeData` in `core/src/utils/json.ts`.
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

    if (
      typeof obj.$numberDouble === "string" &&
      Object.keys(obj).length === 1
    ) {
      // lodash isEqual treats NaN as equal to NaN, so unwrapping suffices
      return Number(obj.$numberDouble);
    }

    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, normalizeForCompare(v)]),
    );
  }

  if (Array.isArray(data)) {
    return data.map(normalizeForCompare);
  }

  if (typeof data === "string") {
    return NONFINITE_STRING_VALUES.get(data) ?? data;
  }

  return data;
};

/** Deep-equality check that first normalizes both sides via {@link normalizeForCompare}. */
export const equalsNormalized = (a: unknown, b: unknown): boolean =>
  isEqual(normalizeForCompare(a), normalizeForCompare(b));
