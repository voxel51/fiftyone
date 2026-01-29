/**
 * Read-only hook for frustum state.
 */

import { useRecoilValue } from "recoil";
import { frustumsVisibleAtom } from "../../state";

/**
 * Read-only hook for frustum state.
 * @returns Object with frustum state values
 */
export function useFrustums() {
  const isVisible = useRecoilValue(frustumsVisibleAtom);

  return { isVisible };
}
