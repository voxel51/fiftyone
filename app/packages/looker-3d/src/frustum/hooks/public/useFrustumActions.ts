/**
 * Actions hook for frustum state mutations.
 */

import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { frustumsVisibleAtom } from "../../state";

/**
 * Actions hook for frustum state mutations.
 * @returns Object with action functions
 */
export function useFrustumActions() {
  const setIsVisible = useSetRecoilState(frustumsVisibleAtom);

  const toggle = useCallback(() => {
    setIsVisible((prev) => !prev);
  }, [setIsVisible]);

  const setVisible = useCallback(
    (visible: boolean) => {
      setIsVisible(visible);
    },
    [setIsVisible]
  );

  return { toggle, setVisible };
}
