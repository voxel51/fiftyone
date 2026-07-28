import { jotaiStore } from "./jotai-store";
import { __unsafeModalViewportAtom } from "./modal";
import type { ModalViewportState } from "./modal";

/**
 * Bridge for synchronous access to modal viewport state from non-React code
 * Provides read-only access to saved viewport state (zoom/pan position).
 */
export const modalBridge = {
  /**
   * Reads the current modal viewport state.
   * @returns the saved viewport state (zoom/pan position), or null if not set
   */
  getModalViewport(): ModalViewportState | null {
    return jotaiStore.get(__unsafeModalViewportAtom);
  },
};
