/**
 * Scope-aware legend counts: a tally of the color column's class
 * indices over the points the user is focused on — the lasso/grid
 * selection when one exists, otherwise the view/filter scope. Returns
 * null when there is nothing to scope by, in which case the legend
 * shows the run's full counts unannotated.
 *
 * The legend's OWN filter is deliberately not part of the scope: a
 * toggled-off class keeps its count, which is what tells the user what
 * toggling it back would show. (Callers pass the server-side scope
 * mask — view stages and sidebar filters — not the combined mask that
 * includes the color field's local evaluation.)
 */
import { MISSING_CATEGORY } from "./colors";

export function legendCounts(
  column: Uint16Array,
  classCount: number,
  // ArrayLike: the lasso keeps its (potentially huge) index list as a
  // typed array; grid selections arrive as plain arrays
  selectedIndices: ArrayLike<number> | null,
  scopeMask: Uint8Array | null,
): number[] | null {
  if (classCount <= 0) return null;

  if (selectedIndices && selectedIndices.length) {
    const counts = new Array<number>(classCount).fill(0);
    for (let i = 0; i < selectedIndices.length; i++) {
      const cls = column[selectedIndices[i]];
      // Missing values have no legend row; indices past the legend's
      // class list (a truncated top-N legend) have no row either
      if (cls !== undefined && cls !== MISSING_CATEGORY && cls < classCount) {
        counts[cls] += 1;
      }
    }
    return counts;
  }

  if (scopeMask) {
    const counts = new Array<number>(classCount).fill(0);
    const length = Math.min(column.length, scopeMask.length);
    for (let i = 0; i < length; i++) {
      if (!scopeMask[i]) continue;
      const cls = column[i];
      if (cls !== MISSING_CATEGORY && cls < classCount) {
        counts[cls] += 1;
      }
    }
    return counts;
  }

  return null;
}
