/**
 * Client-side evaluation of the color-by field's sidebar filter against
 * the color column already in memory — the mask that makes legend
 * clicks instant instead of a masks-endpoint round trip (a full
 * server-side aggregation, seconds at scale).
 *
 * Fidelity rule: the server's match mask is the truth (it applies
 * filters through the same view compiler the grid uses), so this
 * evaluates locally ONLY when the result is provably identical —
 * otherwise it returns null and the caller must leave the filter to
 * the server. Local evaluation requires:
 *
 * - a categorical column whose values are the field's full values
 *   (`meta.exact` — list fields collapse to their first element, where
 *   a column match proves nothing about the field), and
 * - a plain `{values, exclude}` filter whose values all map to listed
 *   classes (foreign values — e.g. beyond the top-N cap — aren't in
 *   the column's vocabulary; extra keys like `isMatching` carry
 *   matching semantics we don't reproduce).
 *
 * Missing values (no value in the field) mirror the server: excluded
 * value sets keep them, included value sets hide them.
 */
import { MISSING_CATEGORY } from "./colors";
import type { CategoricalFilter } from "./legendFilter";
import type { ColorMeta, ColorValues } from "./protocol";

export function localColorMask(
  filter: CategoricalFilter,
  column: ColorValues,
  meta: ColorMeta,
): Uint8Array | null {
  if (column.style !== "categorical" || meta.style !== "categorical") {
    return null;
  }
  if (meta.exact !== true) return null;
  if (!Array.isArray(filter.values)) return null;
  for (const key of Object.keys(filter)) {
    if (key !== "values" && key !== "exclude" && filter[key] !== undefined) {
      return null;
    }
  }

  const indexByLabel = new Map(
    (meta.classes ?? []).map((cls, index) => [cls.label, index]),
  );
  const filterIndices = new Set<number>();
  for (const value of filter.values) {
    const index = indexByLabel.get(value as string | number | boolean);
    if (index === undefined) return null;
    filterIndices.add(index);
  }

  const exclude = filter.exclude === true;
  const { indices } = column;
  const mask = new Uint8Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const classIndex = indices[i];
    const inSet =
      classIndex !== MISSING_CATEGORY && filterIndices.has(classIndex);
    mask[i] = (exclude ? !inSet : inSet) ? 1 : 0;
  }
  return mask;
}
