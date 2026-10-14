/**
 * Other panels' selections, as the plot emphasizes them.
 *
 * Panels narrow the grid through `fos.extendedSelection` — the Map panel's
 * lasso writes its polygon AND the sample ids inside it, and any panel can
 * write ids via the `set_extended_selection` operator. This panel never
 * writes that atom (its own selections travel as the override stage), so
 * whatever it holds came from somewhere else.
 *
 * A selection is focus, not scope: the plot highlights the selected points
 * and dims the rest, as the old panel did, rather than hiding anything.
 *
 * The panel's own stage outranks it. The grid's `extendedStagesUnsorted`
 * shows the override stage INSTEAD of a foreign selection, whichever came
 * first, so the plot must too — otherwise a Map lasso drawn over a live
 * plot lasso would light the plot with the Map's samples while the grid
 * kept showing the plot's.
 */
export function foreignSelectionIds(
  extended:
    | { readonly selection?: readonly string[] | null }
    | null
    | undefined,
  ownStage: unknown,
): readonly string[] | null {
  if (ownStage) return null;
  const ids = extended?.selection;
  // Empty is "nothing selected", not "select nothing": an empty selection
  // would dim every point. The similarity popover writes one on every search
  return ids?.length ? ids : null;
}
