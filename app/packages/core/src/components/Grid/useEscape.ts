import { useDismissable } from "@fiftyone/keymap";
import * as fos from "@fiftyone/state";
import { useRecoilCallback } from "recoil";

/**
 * Clearing the grid selection is a *dismissal*, not a shortcut.
 *
 * This used to be a raw `document` keydown that first had to consult
 * `escapeKeyHandlerIdsAtom` — a `Set<string>` with exactly one producer
 * (AdaptiveMenu) and one consumer (here) — to avoid firing while a popout was
 * open. That Set was a dismissal stack in disguise, so both sides now push
 * layers instead and the coordination atom is gone.
 *
 * Returning `false` when there is nothing to clear is the important part: it
 * declines, so Escape falls through to an outer layer rather than being
 * silently swallowed.
 *
 * The dismisser is synchronous because the stack has to know *now* whether a
 * layer consumed the event; the old handler could afford `await
 * snapshot.getPromise` only because nothing depended on its answer.
 */
const useEscape = () => {
  const dismiss = useRecoilCallback(
    ({ reset, snapshot }) =>
      () => {
        const modal = snapshot.getLoadable(fos.modalSelector).valueMaybe();
        const selected = snapshot.getLoadable(fos.selectedSamples).valueMaybe();

        // Preserved from the original, including its caveat: `modal` reads as
        // null immediately after the modal closes, so this is not quite the
        // condition we want. Left as-is deliberately — changing it here would
        // be a behavior change hiding inside a migration.
        if (modal !== null || !selected?.size) {
          return false;
        }

        if (confirm("Are you sure you want to clear your current selection?")) {
          reset(fos.selectedSamples);
        }
        // Consumed either way: the user was asked, and declining the confirm is
        // an answer. Falling through after a declined confirm would let the
        // same Escape also dismiss whatever is behind the grid.
        return true;
      },
    [],
  );

  useDismissable("grid-selection", "Grid selection", "grid.selection", dismiss);
};

export default useEscape;
