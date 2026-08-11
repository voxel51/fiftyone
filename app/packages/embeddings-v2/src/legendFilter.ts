/**
 * Legend click semantics as pure transforms over the App's sidebar
 * filter for the color-by field. Which classes are "on" derives from
 * that filter, not legend state, so sidebar edits and legend clicks can
 * never disagree. `null` means no filter (every class on).
 *
 * soloLabel (double click) writes INCLUSION: exclusion can't isolate
 * one class, since values outside the legend's list (missing, or past
 * the top-N cap) would stay visible. Solo also drops any prior filter's
 * foreign values/extra properties.
 *
 * toggleLabel (single click) keeps whichever form the filter is already
 * in, so the clicks after a solo go on editing its inclusion instead of
 * undoing it. With no filter to follow it writes EXCLUSION: hide a few
 * known classes, keep everyone else — including values the legend
 * doesn't know about — visible.
 *
 * A filter that turns every class back on collapses to `null`.
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

/** Double click: isolate one class via inclusion — exclusion could only
 * name the OTHER known classes, leaving unlisted values visible. On the
 * lone visible class, restore all (the escape hatch) */
export function soloLabel(
  filter: CategoricalFilter | null,
  labels: readonly string[],
  label: string,
): CategoricalFilter | null {
  const on = onLabels(filter, labels);
  if (on.size === 1 && on.has(label)) return null;
  return { values: [label], exclude: false };
}

function build(
  base: CategoricalFilter | null,
  on: ReadonlySet<string>,
  labels: readonly string[],
): CategoricalFilter | null {
  const known = new Set(labels);
  // The form follows the filter being edited: the inclusion a solo left
  // behind goes on naming what is shown, everything else names what is
  // hidden. Foreign values ride along in either form — their meaning
  // only inverts if the form changes under them
  const include = Boolean(base?.values) && base?.exclude !== true;
  const foreign = (base?.values ?? []).filter(
    (value) => !(typeof value === "string" && known.has(value)),
  );
  const values = labels.filter((label) =>
    include ? on.has(label) : !on.has(label),
  );
  if (!values.length && !foreign.length) return null;

  return { ...base, values: [...values, ...foreign], exclude: !include };
}
