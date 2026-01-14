import { modalSample } from "@fiftyone/state";
import { get } from "lodash";
import { useRecoilValue } from "recoil";

/**
 * Hook to get a value from the current modal sidebar sample by path.
 *
 * @param path - The dot-delimited path to the value in the sample
 * @returns The value at the given path, or null if the sample doesn't exist
 */
export const useSampleValue = (path: string): unknown | null => {
  const currentSample = useRecoilValue(modalSample);
  // Get the value from the current sample using the path
  return currentSample ? get(currentSample, path) : null;
};
