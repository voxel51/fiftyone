import { useCallback } from "react";
import { useClearPointPrompts } from "./useClearPointPrompts";
import { usePointSelectionSeed } from "./usePointSelectionSeed";

/**
 * Ends the current point-prompt session: drops the pending prompts AND makes
 * the next point seed a NEW label rather than refining whatever is still
 * selected.
 *
 * Both halves are the session boundary. Clearing alone leaves the previous
 * target selected — and a committed detection stays selected (auto-extended
 * onto later frames), so the next click would land as a refinement that
 * overwrites that label's mask instead of creating the new object the user is
 * pointing at.
 *
 * A right-click commit runs the same transition through
 * `finalizePointSelection`; use this at the boundaries that aren't a commit —
 * the playhead moving off the prompted frame, or a tracking run starting.
 */
export const useEndPointSession = (): (() => void) => {
  const clearPointPrompts = useClearPointPrompts();
  const { markSeedNew } = usePointSelectionSeed();

  return useCallback(() => {
    clearPointPrompts();
    markSeedNew();
  }, [clearPointPrompts, markSeedNew]);
};
