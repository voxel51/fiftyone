import { useCallback } from "react";
import { usePointSelection } from "./usePointSelection";
import { useToolsState } from "./useToolsContext";

/**
 * Clears the pending point prompts, leaving point selection active so the user
 * can keep placing points on an empty canvas.
 *
 * Both halves are required: `clearPoints` only wipes the rendered keypoints,
 * and the overlay doesn't emit the per-point delete events the tools state is
 * fed from — so without the reset the cleared points would still reach the
 * next `infer()` call.
 */
export const useClearPointPrompts = (): (() => void) => {
  const { clearPoints } = usePointSelection();
  const { reset: resetToolsState } = useToolsState();

  return useCallback(() => {
    clearPoints();
    resetToolsState();
  }, [clearPoints, resetToolsState]);
};
