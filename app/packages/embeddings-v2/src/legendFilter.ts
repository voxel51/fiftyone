/**
 * Legend click semantics as pure transforms over the App's sidebar
 * filter for the color-by field. The legend keeps no selection state of
 * its own: which classes are "on" derives from that filter, and a click
 * maps the current filter to the next one — so sidebar edits and legend
 * clicks can never disagree. `null` stands for "no filter" (every class
 * on) in both directions.
 *
 * Representation rules:
 * - Toggles stay in the filter's current mode — exclusion when starting
 *   fresh, so values the legend cannot list (a field's classes beyond
 *   the top-N cap) keep showing; inclusion after a solo.
 * - Filter values outside the legend's class list (sidebar entries for
 *   uncapped classes) ride along untouched.
 * - A filter that turns every class back on collapses to `null`.
 */

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

/** Double click: isolate one class; on the lone visible class, restore
 * all (the escape hatch) */
export function soloLabel(
  filter: CategoricalFilter | null,
  labels: readonly string[],
  label: string,
): CategoricalFilter | null {
  const on = onLabels(filter, labels);
  if (on.size === 1 && on.has(label)) return null;
  return { ...filter, values: [label], exclude: false };
}

function build(
  base: CategoricalFilter | null,
  on: ReadonlySet<string>,
  labels: readonly string[],
): CategoricalFilter | null {
  const known = new Set(labels);
  const foreign = (base?.values ?? []).filter(
    (value) => !(typeof value === "string" && known.has(value)),
  );
  if (on.size >= labels.length && !foreign.length) return null;

  const exclude = base?.values ? base.exclude === true : true;
  const own = labels.filter((label) =>
    exclude ? !on.has(label) : on.has(label),
  );
  return { ...base, values: [...own, ...foreign], exclude };
}
