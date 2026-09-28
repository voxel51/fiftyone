import { useActiveModalSample } from "@fiftyone/state";
import { useCallback } from "react";
import type { Sample } from "@fiftyone/looker";
import { resolveSampleVersionToken } from "../util";

/**
 * Hook which returns a version token getter for the given sample.
 *
 * The getter resolves the token at call time from the newer of the render
 * closure's sample and the last server response for that sample, so a persist
 * queued behind another one sends the token the server just returned rather
 * than the pre-patch one still held by the closure.
 *
 * @param sample Sample for which to generate a version token getter
 */
export const useGetVersionTokenWith = ({
  sample,
}: {
  sample: Sample | null;
}): (() => string | null) => {
  return useCallback(() => resolveSampleVersionToken({ sample }), [sample]);
};

/**
 * Hook which returns a version token getter for the current modal sample.
 */
export const useGetVersionToken = (): (() => string | null) => {
  return useGetVersionTokenWith({ sample: useActiveModalSample() });
};
