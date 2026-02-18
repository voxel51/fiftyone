/**
 * Bridge for accessing quick draw state from non-React code.
 */

import { getDefaultStore } from "jotai";
import { _dangerousQuickDrawActiveAtom } from "./useQuickDraw";

let _createCallback: (() => void) | null = null;

/**
 * Quick draw bridge for non-React code.
 * Provides read-only access to quick draw state and deferred creation.
 */
export const quickDrawBridge = {
  /**
   * Check if quick draw mode is currently active.
   * @returns true if quick draw mode is active, false otherwise
   */
  isQuickDrawActive(): boolean {
    const store = getDefaultStore();
    return store.get(_dangerousQuickDrawActiveAtom);
  },

  /**
   * Register a callback to be invoked when the user mouses down in the scene.
   * This defers detection creation until the user actually starts drawing.
   */
  registerCreateCallback(cb: () => void): void {
    _createCallback = cb;
  },

  /**
   * Clear the registered creation callback.
   */
  clearCreateCallback(): void {
    _createCallback = null;
  },

  /**
   * Invoke the registered creation callback if one exists.
   * @returns true if a callback was invoked, false otherwise
   */
  triggerCreate(): boolean {
    if (_createCallback) {
      _createCallback();
      return true;
    }
    return false;
  },
};
