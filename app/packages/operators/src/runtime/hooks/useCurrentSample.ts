import { useRecoilValueLoadable } from "recoil";
import * as fos from "@fiftyone/state";

/**
 * useCurrentSample
 *
 * Fetches the currently selected sample from the recoil state.
 *
 * @returns {string | null} - The ID of the current sample, or null if not available.
 */
export default function useCurrentSample(): string | null {
  // 'currentSampleId' may suspend for group datasets, so we use a loadable
  const currentSample = useRecoilValueLoadable(fos.currentSampleId);

  // Check the state of the loadable and return the content if available
  return currentSample.state === "hasValue" ? currentSample.contents : null;
}
