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
 */
export function useClearPublishedSelection(): () => void {
  return useRecoilCallback(
    ({ set, reset }) =>
      () => {
        fos.resetExtendedSelectionTransaction({ set, reset });
        reset(selectionCountState);
        reset(selectionSampleCountState);
      },
    [],
  );
}
