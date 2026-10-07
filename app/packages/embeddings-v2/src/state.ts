import * as fos from "@fiftyone/state";
import { atom, useRecoilCallback } from "recoil";

/**
 * The active plot selection's size, published by the plot view for
 * chrome that lives outside it (the panel tab's selection pill). Null
 * when nothing is selected or no plot is open. This is deliberately a
 * count, not an id list — selections resolve server-side as view
 * stages and ids are never materialized on the client.
 */
export const selectionCountState = atom<number | null>({
  key: "embeddings-v2/selection-count",
  default: null,
});

/**
 * The active selection's SAMPLE count, when the publisher knows it.
 * `selectionCountState` counts points, and one sample can own many
 * points (every patch of an image, every window of an episode), so
 * sample-facing chrome reads this and falls back to the point count
 * when it is null (a server-resolved stage may not enumerate samples).
 */
export const selectionSampleCountState = atom<number | null>({
  key: "embeddings-v2/selection-sample-count",
  default: null,
});

// Any reset of the App's extended selection drops this panel's stage (a
// view change resets it, for one), so the counts describing that stage
// drop in the same commit, whether or not a plot view is mounted to notice.
// Without it the chip and the tab pill keep counting a selection nothing
// applies. A fast refresh may register a second copy; it resets the same
// two atoms, so it is harmless
fos.registerExtendedSelectionResetParticipant(({ reset }) => {
  reset(selectionCountState);
  reset(selectionSampleCountState);
});

/**
 * Clear-selection requests from outside the plot view (the tab pill's
 * dismiss). A monotonic nonce rather than a boolean: the plot view
 * reacts to changes, so repeated requests always fire.
 */
export const clearSelectionNonceState = atom<number>({
  key: "embeddings-v2/clear-selection-nonce",
  default: 0,
});

/**
 * Clears the plot's published selection from outside the plot view: every
 * extended-selection layer through the App's own reset, then the counts
 * above, in one commit. Inside the plot view `clearAll` is the one to
 * call, since it also tears down the local layers (lasso indices, the
 * chart's dim); this serves the panel root, where the plot view may
 * already be unmounted (spaces renders only the active tab).
 *
 * Only the panel's own selection is its to clear. The count marks it:
 * every stage the plot publishes carries one, and any other publish or
 * reset clears it (see the participant above). Another panel's selection,
 * or the view bar's search, stays for its owner to clear, as the Map
 * panel does on close.
 */
export function useClearPublishedSelection(): () => void {
  return useRecoilCallback(
    ({ set, reset, snapshot }) =>
      () => {
        if (snapshot.getLoadable(selectionCountState).valueMaybe() == null) {
          return;
        }
        fos.resetExtendedSelectionTransaction({ set, reset });
        reset(selectionCountState);
        reset(selectionSampleCountState);
      },
    [],
  );
}
