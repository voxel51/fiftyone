import { useModalSample } from "@fiftyone/state";
import { useCallback } from "react";
import type { Sample } from "@fiftyone/looker";
import { getSampleVersionToken } from "../util";

/**
 * Hook which returns a version token getter for the given sample.
 *
 * @param sample Sample for which to generate a version token getter
 */
export const useGetVersionTokenWith = ({
  sample,
}: {
  sample: Sample | null;
}): (() => string) => {
  return useCallback(() => getSampleVersionToken({ sample }), [sample]);
};

/**
 * Hook which returns a version token getter for the current modal sample.
 */
export const useGetVersionToken = (): (() => string) => {
  return useGetVersionTokenWith({ sample: useModalSample()?.sample });
};
