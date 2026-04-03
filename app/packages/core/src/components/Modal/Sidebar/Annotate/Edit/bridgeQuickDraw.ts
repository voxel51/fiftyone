/**
 * Bridge for accessing quick draw state from non-React code.
 */

import { annotationStore } from "../redux/store";

/**
 * Quick draw bridge for non-React code.
 * Provides read-only access to quick draw state.
 */
export const quickDrawBridge = {
  /**
   * Check if quick draw mode is currently active.
   * @returns true if quick draw mode is active, false otherwise
   */
  isQuickDrawActive(): boolean {
    return annotationStore.getState().annotation.quickDrawActive;
  },
};
