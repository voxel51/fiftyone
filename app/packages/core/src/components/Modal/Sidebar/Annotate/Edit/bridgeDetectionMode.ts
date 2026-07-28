/**
 * Bridge for accessing detection mode state from non-React code.
 */

import { getDefaultStore } from "jotai";
import { _unsafeDetectionModeActiveAtom } from "./useDetectionMode";

/**
 * Detection mode bridge for non-React code.
 * Provides read-only access to detection mode state.
 */
export const detectionModeBridge = {
  /**
   * Check if detection mode is currently active.
   * @returns true if detection mode is active, false otherwise
   */
  isActive(): boolean {
    const store = getDefaultStore();
    return store.get(_unsafeDetectionModeActiveAtom);
  },
};
