/**
 * Bridge for accessing quick draw state from non-React code.
 */

import { getDefaultStore } from "jotai";
import { quickDrawActiveAtom } from "./state";

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
    const store = getDefaultStore();
    return store.get(quickDrawActiveAtom);
  },
};
