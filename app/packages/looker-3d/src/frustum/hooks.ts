/**
 * Domain hooks for camera frustum state management.
 * Following CODING_STANDARDS.md: atoms are private, only hooks are exported.
 */

import { useCallback } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { frustumsVisibleAtom } from "./state";

/**
 * Read-only hook for frustum visibility state.
 * @returns Whether frustums are currently visible
 */
export function useFrustumsVisible(): boolean {
  return useRecoilValue(frustumsVisibleAtom);
}

/**
 * Command hook for toggling frustum visibility.
 * @returns Object with current visibility state and toggle function
 */
export function useToggleFrustums(): {
  isVisible: boolean;
  toggle: () => void;
  setVisible: (visible: boolean) => void;
} {
  const [isVisible, setIsVisible] = useRecoilState(frustumsVisibleAtom);

  const toggle = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  const setVisible = useCallback((visible: boolean) => {
    setIsVisible(visible);
  }, []);

  return { isVisible, toggle, setVisible };
}
