/**
 * Legend click semantics as pure transforms over the App's sidebar
 * filter for the color-by field. The legend keeps no selection state of
 * its own: which classes are "on" derives from that filter, and a click
 * maps the current filter to the next one — so sidebar edits and legend
 * clicks can never disagree. `null` stands for "no filter" (every class
 * on) in both directions.
 *
 * The legend writes EXCLUSION filters, always. The filter is a pure
 * function of the toggle set — identical toggle states produce
 * identical filters no matter the click path, so the sidebar can never
 * flip between "omit" and "show" for the same legend state, and a solo
 * (double-click) is exactly equivalent to single-clicking every other
 * class off. Consequences accepted with that choice: points with no
 * value in the field, and a capped field's unlisted (>top-N) classes,
 * are never hidden by legend clicks — exclusion can't name them.
 *
 * Other rules:
 * - Excluded values outside the legend's class list (sidebar entries
 *   for uncapped classes) ride along untouched; an inclusion filter's
 *   foreign values cannot be expressed in exclusion form and are
 *   dropped on the first legend click.
 * - A filter that turns every class back on collapses to `null`.
 */
import type { ColorMeta } from "./protocol";

/** One value in a sidebar filter, mirroring fos.Filter's value type */
type FilterValue = string | boolean | number | null | undefined;

/** The sidebar's categorical filter shape; extra keys (`isMatching`,
 * ...) are preserved verbatim across transforms. Structurally a
 * fos.Filter, so transforms write straight back to the filter atom. */
export interface CategoricalFilter {
  values?: FilterValue[];
  exclude?: boolean;
  [key: string]: FilterValue | FilterValue[];
}

/**
 * The legend's view of a color-by field: its string class labels and
 * which of them the filter currently hides. Null when the field's
 * classes are not filterable — non-string labels (the sidebar's
 * numeric filters are range-shaped, not value lists) or no categorical
 * classes at all — in which case the legend renders inert.
 */
export function legendLabels(
  meta: ColorMeta | null,
  filter: CategoricalFilter | null,
): { labels: string[]; off: Set<string> } | null {
  const classes = meta?.style === "categorical" ? meta.classes : undefined;
  if (!classes?.length) return null;
  const labels = classes.map((cls) => cls.label);
  if (!labels.every((label): label is string => typeof label === "string")) {
    return null;
  }
  const on = onLabels(filter, labels);
  return { labels, off: new Set(labels.filter((label) => !on.has(label))) };
}

/** The classes `filter` leaves visible; no value filter means all */
export function onLabels(
  filter: CategoricalFilter | null,
  labels: readonly string[],
): Set<string> {
  if (!filter?.values) return new Set(labels);
  const values = new Set(
    filter.values.filter((value): value is string => typeof value === "string"),
  );
  return new Set(
    filter.exclude
      ? labels.filter((label) => !values.has(label))
      : labels.filter((label) => values.has(label)),
  );
}

/** Single click: toggle one class in or out of view */
export function toggleLabel(
  filter: CategoricalFilter | null,
  labels: readonly string[],
  label: string,
): CategoricalFilter | null {
  const on = onLabels(filter, labels);
  if (on.has(label)) {
    on.delete(label);
  } else {
    on.add(label);
  }
  return build(filter, on, labels);
}

/** Double click: isolate one class — a bulk toggle, writing the exact
 * filter that single-clicking every other class off would. On the lone
 * visible class, restore all (the escape hatch) */
export function soloLabel(
  filter: CategoricalFilter | null,
  labels: readonly string[],
  label: string,
): CategoricalFilter | null {
  const on = onLabels(filter, labels);
  if (on.size === 1 && on.has(label)) return null;
  return build(filter, new Set([label]), labels);
}

function build(
  base: CategoricalFilter | null,
  on: ReadonlySet<string>,
  labels: readonly string[],
): CategoricalFilter | null {
  const known = new Set(labels);
  // Only exclusions can carry foreign values forward — an inclusion
  // filter's foreign values would invert meaning in exclusion form
  const foreign =
    base?.exclude === true
      ? (base.values ?? []).filter(
          (value) => !(typeof value === "string" && known.has(value)),
        )
      : [];
  const off = labels.filter((label) => !on.has(label));
  if (!off.length && !foreign.length) return null;

  return { ...base, values: [...off, ...foreign], exclude: true };
}
