/**
 * Read-only hook for frustum state.
 */

import { useReverbValue } from "@fiftyone/reverb";
import { frustumsVisibleAtom } from "../../state";

/**
 * Read-only hook for frustum state.
 * @returns Object with frustum state values
 */
export function useFrustums() {
  const isVisible = useReverbValue(frustumsVisibleAtom);

  return { isVisible };
}
