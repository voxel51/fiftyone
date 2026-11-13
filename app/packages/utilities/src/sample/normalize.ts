import { isEqual } from "lodash";

import { FLOAT_FIELD, LIST_FIELD } from "../constants";
import type { Schema } from "../schema";

/**
 * The live set behind {@link NONFINITE_FIELDS}: the built-in label fields,
 * plus every float field a dataset schema declares (see
 * {@link registerNonfiniteFields}).
 */
const nonfiniteFields = new Set<string>(["points", "confidence"]);

/**
 * The field names whose non-finite doubles travel as strings on the wire —
 * the server stringifies every non-finite float (`fiftyone.core.json`), and
 * `core/src/client/transformer.ts` imports this set for the write-side
 * inverse. The string collapse below is GATED to these keys: normalized trees
 * also feed patch payloads (`structuralSupplier`, `serializeAdd`), so an
 * ungated collapse would rewrite a string field whose literal value is
 * `"nan"` (legal for a str point attribute) into float NaN.
 *
 * `points` and `confidence` are built in; every other float field comes from
 * the dataset schema, so a custom float attribute (a per-point list filled
 * with NaN, or a label-level score) compares equal to its own echo and is
 * never written back as the string `"nan"`. Keyed by field name: a str
 * attribute sharing a name with some float field would have a literal `"nan"`
 * read as NaN, an accepted edge.
 */
export const NONFINITE_FIELDS: ReadonlySet<string> = nonfiniteFields;

/**
 * Add every float and float-list field that `schema` declares, at any depth
 * (label attributes are nested under their label field), to
 * {@link NONFINITE_FIELDS}. Registration only grows the set; names from a
 * previously viewed dataset stay registered, which is harmless for fields
 * that no longer exist.
 */
export const registerNonfiniteFields = (schema: Schema): void => {
  for (const [name, field] of Object.entries(schema)) {
    if (
      field.ftype === FLOAT_FIELD ||
      (field.ftype === LIST_FIELD && field.subfield === FLOAT_FIELD)
    ) {
      nonfiniteFields.add(name);
    }

    if (field.fields) {
      registerNonfiniteFields(field.fields);
    }
  }
};

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
 * - Object members whose value is `undefined` → dropped. JSON drops them, so
 *   the server can never echo one back; a member set to `undefined` and an
 *   absent member are the same stored value. Kept, a stray `undefined` (e.g.
 *   an optional field copied from a label that lacks it) makes a label
 *   compare unequal to its own persisted echo forever, while the JSON patch
 *   between them is empty — or, for a keypoint, carries only the NaN-hole
 *   replaces a patch compare emits because `NaN !== NaN`.
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
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, normalizeForCompare(v, k)]),
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
