import { atom, getDefaultStore } from "jotai";
import { useCallback } from "react";

/**
 * When `true`, the next point-selection inference seeds a brand-new label
 * instead of refining the currently-selected one.
 *
 * Point-selection resolves its inference target from the sidebar selection
 * (`selected ?? new uuid`). That conflates "what's open in the sidebar" with
 * "what the point stream is building": right after a right-click commit the
 * just-finished mask stays selected for editing, yet the next click must start
 * a FRESH mask — not refine the committed one. This flag decouples the two for
 * exactly one inference.
 *
 * Module-private; reach it through {@link usePointSelectionSeed}. Read fresh
 * from the store (not via subscription) since it's consumed imperatively inside
 * the inference effect.
 */
const seedNewLabelAtom = atom(false);

export interface PointSelectionSeed {
  /** Force the next inference to seed a new label (set on finalize/commit). */
  markSeedNew(): void;
  /**
   * Read the flag WITHOUT clearing it. Used at click time — before the
   * inference effect consumes it — so point-variant resolution can ignore the
   * still-selected committed mask and treat the click as a positive seed.
   */
  shouldSeedNew(): boolean;
  /**
   * Read-and-clear the flag. Returns whether the next inference should seed a
   * new label; resets to `false` so only that one inference is affected.
   */
  consumeSeedNew(): boolean;
  /** Drop the flag without consuming — a fresh session refines by default. */
  clearSeedNew(): void;
}

export const usePointSelectionSeed = (): PointSelectionSeed => {
  const markSeedNew = useCallback(() => {
    getDefaultStore().set(seedNewLabelAtom, true);
  }, []);

  const shouldSeedNew = useCallback(
    () => getDefaultStore().get(seedNewLabelAtom),
    [],
  );

  const consumeSeedNew = useCallback(() => {
    const store = getDefaultStore();
    const seed = store.get(seedNewLabelAtom);

    if (seed) {
      store.set(seedNewLabelAtom, false);
    }

    return seed;
  }, []);

  const clearSeedNew = useCallback(() => {
    getDefaultStore().set(seedNewLabelAtom, false);
  }, []);

  return { markSeedNew, shouldSeedNew, consumeSeedNew, clearSeedNew };
};
