import { isEqual } from "lodash";

/**
 * The field names whose non-finite doubles travel as strings on the wire —
 * the GraphQL sample-read convention (see `NONFINITE` in `@fiftyone/looker`)
 * and the write-side inverse in `core/src/client/transformer.ts`, which
 * imports this set. The string collapse below is GATED to these keys:
 * normalized trees also feed patch payloads (`structuralSupplier`,
 * `serializeAdd`), so an ungated collapse would rewrite a string field whose
 * literal value is `"nan"` (legal for a str point attribute) into float NaN.
 */
export const NONFINITE_FIELDS: ReadonlySet<string> = new Set([
  "points",
  "confidence",
]);

/**
 * Plain JSON cannot represent non-finite doubles, so the App holds them in
 * two representations: real NaN / Infinity in engine stores, and these
 * strings in read-shaped sample data.
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
 *   convention for the same values — but ONLY under a {@link NONFINITE_FIELDS}
 *   key. `fieldName` is the key the value sits under: objects establish it
 *   for their entries, arrays inherit it (a `points` row keeps the `points`
 *   context). A caller comparing a bare value (no wrapping object) passes the
 *   governing field name itself.
 *
 * The non-finite collapses matter for keypoints: a skipped node's coordinate
 * is `[NaN, NaN]`, and an unequal compare against its own persisted echo
 * makes the save loop re-send the same patch every autosave tick, forever.
 * Mirrors `normalizeData` in `core/src/utils/json.ts`.
 */
export const normalizeForCompare = (
  data: unknown,
  fieldName?: string,
): unknown => {
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
      Object.entries(obj).map(([k, v]) => [k, normalizeForCompare(v, k)]),
    );
  }

  if (Array.isArray(data)) {
    return data.map((item) => normalizeForCompare(item, fieldName));
  }

  if (
    typeof data === "string" &&
    fieldName &&
    NONFINITE_FIELDS.has(fieldName)
  ) {
    return NONFINITE_STRING_VALUES.get(data) ?? data;
  }

  return data;
};

/**
 * Deep-equality check that first normalizes both sides via
 * {@link normalizeForCompare}. `fieldName` seeds the key context for bare
 * values — see the gate note there.
 */
export const equalsNormalized = (
  a: unknown,
  b: unknown,
  fieldName?: string,
): boolean =>
  isEqual(normalizeForCompare(a, fieldName), normalizeForCompare(b, fieldName));
