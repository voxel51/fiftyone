import { useSetPanelCloseEffect } from "@fiftyone/spaces";
import { useEffect } from "react";
import { useClearPublishedSelection } from "./state";

/**
 * Closing the panel clears the plot's selection. A lasso narrows the grid
 * through the override stage, which nothing outside this panel shows or
 * can clear: the tab's pill is the only control, and it leaves with the
 * tab, stranding the grid on a selection the reader can no longer see.
 *
 * Registered at the panel root, not in the plot view: spaces renders only
 * the active tab, so the plot (and its `clearAll`) is unmounted whenever
 * the closed tab is not the active one. The effect writes Recoil directly
 * for the same reason — a request through `clearSelectionNonceState` is
 * answered by a plot view that may already be gone.
 */
export function useClearSelectionOnClose(): void {
  const setPanelCloseEffect = useSetPanelCloseEffect();
  const clear = useClearPublishedSelection();

  useEffect(() => {
    setPanelCloseEffect(clear);
  }, [setPanelCloseEffect, clear]);
}
