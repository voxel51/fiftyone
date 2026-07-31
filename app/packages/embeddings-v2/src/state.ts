import { atom } from "recoil";

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
 * Clear-selection requests from outside the plot view (the tab pill's
 * dismiss). A monotonic nonce rather than a boolean: the plot view
 * reacts to changes, so repeated requests always fire.
 */
export const clearSelectionNonceState = atom<number>({
  key: "embeddings-v2/clear-selection-nonce",
  default: 0,
});
