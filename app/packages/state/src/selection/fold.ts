/**
 * Past this many captures the strip folds: it renders the first and last
 * FOLD_EDGE cards around a fold that reveals FOLD_STEP more per side each
 * time it is pressed. The summary keeps the exact count; the loader
 * describes only the rendered ends.
 */
export const FOLD_THRESHOLD = 100;
export const FOLD_EDGE = 50;
export const FOLD_STEP = 50;

export interface FoldWindow<T> {
  readonly head: readonly T[];
  /** Items between the two ends that are not rendered. */
  readonly hidden: number;
  readonly tail: readonly T[];
}

/**
 * Splits a long capture list into what is worth rendering: its start, its
 * end, and a count of what lies between. Capture order makes both ends
 * meaningful (the first picks and the latest ones) and the middle noise.
 * `revealed` is how many extra items each end has been expanded by.
 */
export function foldWindow<T>(
  items: readonly T[],
  revealed: number,
): FoldWindow<T> {
  const edge = FOLD_EDGE + Math.max(0, revealed);
  if (items.length <= FOLD_THRESHOLD || items.length <= edge * 2)
    return { head: items, hidden: 0, tail: [] };
  return {
    head: items.slice(0, edge),
    hidden: items.length - edge * 2,
    tail: items.slice(items.length - edge),
  };
}
